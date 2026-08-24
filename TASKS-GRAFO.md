# Contexto relacional do copiloto ("graph engineering") — Plano de Implementação

> Documento de planejamento. **Não contém código de implementação.** A fonte de verdade do
> produto continua sendo `SPEC.md`; as regras invioláveis continuam sendo as de `CLAUDE.md`.
> Onde este plano toca uma regra existente, ele diz explicitamente qual.
>
> **Origem** — 24/08/2026. O dono relatou que "o copiloto não tem contexto suficiente" e
> propôs migrar para uma estrutura em grafo. Duas investigações paralelas (auditoria do
> código + estado da arte 2025–2026) chegaram à mesma conclusão: **o diagnóstico está certo
> e o remédio proposto, não**. Este plano registra o porquê e entrega o caminho que resolve
> o sintoma real.

---

## 1. Veredito que organiza o documento

```
Grafo como BANCO DE DADOS  -> hype neste app. Não fazer.
Grafo como FORMA DA SAÍDA  -> é o ganho real. Fazer.
Grafo como MEMÓRIA TEMPORAL -> vale, em versão mínima. Fazer depois.
Grafo de CONTROLE (LangGraph) -> resolve outro problema. Não é este.
```

O Postgres **já é** o grafo. `Transacao` é um nó com seis arestas de saída — categoria,
conta, contaDestino, provisão, parcelamento, ciclo (`prisma/schema.prisma:150-170`) — com
integridade **imposta** pelo banco. Extrair um KG com LLM em cima disso é pagar token para
reconstruir, de forma probabilística e sem garantia de `donoId`, um esquema que já é
determinístico.

O que falta não é um banco de grafo. É que **o copiloto recebe agregados escalares e nunca
a vizinhança de uma entidade**.

### 1.1 O que o app é hoje, sem diplomacia

> **Um agente de leitura de 6 turnos, sem planejamento, sobre uma API determinística — com
> um RAG vestigial de preferências pendurado ao lado.**

| Componente | Classificação | Evidência |
|---|---|---|
| Copiloto conversacional | **Agente** de leitura, degrau mais baixo | `copiloto.ts:238` manda as 16 ferramentas em todo turno, sem roteador; `MAX_TURNOS=6` (`copiloto.ts:36`); zero planejamento, zero crítica, zero memória de execução |
| Camada de ferramentas | **Não é RAG.** API tipada sobre motor determinístico | Cada ferramenta chama caso de uso que chama função pura testada. Saída é computada, não recuperada |
| Memória vetorial | **RAG**, o mais primitivo que existe | `ORDER BY embedding <=> $vetor LIMIT 5` (`prisma-memoria.ts:155-165`): sem threshold, sem re-rank, sem tempo, sem relação |

**Os dois lados não se tocam.** O RAG sabe *o que o dono quer* e não sabe nenhum número
(regra 7c). As ferramentas sabem *todos os números* e não sabem nada sobre o dono. Nenhuma
camada liga uma coisa à outra — e é exatamente isso que se sente como "falta contexto".

Detalhe que importa: o bloco de memória que entra em **todo** prompt (`copiloto.ts:216-219`)
não usa o índice vetorial. É `ORDER BY createdAt DESC LIMIT 30` (`prisma-memoria.ts:114-125`).
O caminho mais influente da memória nem sequer é RAG — é recência disfarçada de contexto.

---

## 2. As sete causas de "falta contexto"

Ordenadas por impacto. Todas verificáveis no código.

**C1 — Ferramentas devolvem agregado sem entidade.** `gastos_por_categoria`
(`ferramentas/situacao.ts:100-116`) devolve `{ nome, percentual, totalCents }`. Sem
`categoriaId`, sem as transações que compõem o total. E **não existe nenhuma ferramenta de
listagem de `Transacao`** em todo o catálogo (`ferramentas/catalogo.ts:89-380`). "Por que
Alimentação subiu?" é estruturalmente irrespondível. O copiloto vê o app como 16 relatórios
de gerência, nunca como dados. É a D-15 aplicada só à verba e não generalizada.

**C2 — Arestas que o domínio usa e o banco não tem.**

| Aresta conceitual | Estado | Consequência |
|---|---|---|
| `Parcelamento → Categoria` | `schema.prisma:193` — `categoriaId String?` **sem `@relation`** | Prisma não faz o join. "Quanto de Eletrônicos é parcela" não é derivável |
| `CustoFixo → Categoria` | **campo não existe** (`schema.prisma:64-86`) | R$ 4.884/mês — **~35% da renda — não aparece em nenhuma análise por categoria** |
| `Transacao → Transacao` (estorno) | `schema.prisma:167` sem FK | Estorno é órfão. "Este gasto foi estornado" não é derivável |
| `Ciclo → Ciclo` (rollover) | `schema.prisma:219` só tem `rolloverRecebidoCents` | A cadeia é invisível. "De onde veio essa sobra?" não tem caminho |

A do `CustoFixo` é grave e **não é sobre IA**: é buraco de produto que a IA expôs.

**C3 — Memória e entidades em universos separados.** `Memoria` (`schema.prisma:331-351`)
não referencia nenhuma entidade financeira. O dono diz "academia é linha vermelha", vira
memória; depois pergunta "onde eu corto?" e `analise_corte` devolve Academia no topo. A
memória só entra se o modelo lembrar de chamar `buscar_memoria` **e** o cosseno casar. A
ligação existe só na cabeça do modelo, por turno, por sorte.

**C4 — Top-k semântico puro, sem tempo.** Duas memórias contraditórias ("quero trocar de
carro" / "desisti do carro") são recuperadas **ambas, com peso igual**. `Memoria` só tem
`ativo` booleano (`schema.prisma:338`) — sem intervalo de validade, sem supersessão.

**C5 — Sem eixo temporal fora de ciclo fechado.** `analise_corte` e
`assinaturas_detectadas` (`ferramentas/analise.ts:24,48`) leem N ciclos fechados e devolvem
médias. Não há série por categoria, nem "o que mudou deste ciclo para o anterior". O único
delta do app é `variacaoMensalCents` do patrimônio. O copiloto não tem noção de trajetória.

**C6 — `patrimonio_resumo` não emite a conciliação.** A D-13 diz que a divergência
razão×realidade **é informação**. Ela é calculada em `application/patrimonio.ts:94` e
**não sai** na ferramenta (`ferramentas/patrimonio.ts:38-62`). Repete a D-14 num lugar novo.

**C7 — O modelo nunca vê o próprio raciocínio anterior.** `conversas.ts:89-97` reenvia só
`conteudo`; a proveniência fica em `MensagemConversa.proveniencia` exclusivamente para a UI.
Numa conversa longa o modelo re-descobre do zero, a cada pergunta, quais ferramentas cobrem
o quê — dentro de um orçamento de 6 turnos.

---

## 3. ADR-16 — Grafo em Postgres puro, sem banco de grafo

**Status:** Proposta · **Data:** 24/08/2026

**Contexto.** O copiloto responde com agregados desconectados. Avaliou-se introduzir grafo
de conhecimento dedicado.

**Decisão.** Modelar o grafo **como FKs e vizinhança no Postgres existente**, atrás de uma
`GrafoPort`. Nada de Apache AGE, Neo4j, Memgraph, Graphiti ou cognee.

**Alternativas avaliadas:**

| Opção | Por que não |
|---|---|
| **Apache AGE** | Não empacotado no `postgresql@16` do Homebrew; Prisma não conhece `agtype` → **tudo vira SQL cru**, reabrindo a armadilha do pgvector em escala muito maior; `donoId` viraria propriedade de nó verificada à mão; backup/restore não-trivial. Ganho ≈ zero neste volume |
| **Neo4j / Memgraph** | Segundo banco: dupla escrita, sincronização, dois backups e **a fronteira multi-tenant reimplementada do zero**. Desproporcional para app local |
| **Graphiti / cognee** | Exigem Neo4j/Kuzu; extração de entidade por LLM **a cada mensagem** contra um teto diário que já se vigia (`limite-ia.ts`); e a extração inevitavelmente capturaria valores monetários → **colide de frente com a regra 7c**. Rejeitado por conflito de regra, não só por custo |

**Consequências.** Ganha-se contexto relacional sem infra nova e sem sair do Prisma.
Perde-se travessia livre em Cypher — irrelevante com ~400-600 transações/ano e profundidade
máxima 3. Se um dia o volume justificar, AGE entra **atrás da mesma `GrafoPort`**, sem tocar
em domínio nem em ferramenta. É por isso que a porta existe.

### 3.1 Evidência externa que sustenta a decisão

- Limiar prático publicado: **abaixo de ~10k nós / ~50k arestas**, CTE recursiva de
  profundidade 2–3 roda em microssegundos e o argumento de performance não existe. Este app
  está três ordens de grandeza abaixo.
- Métodos estruturais (RAPTOR, GraphRAG, LightRAG) **degradam QA factual simples em 5–10 F1**
  enquanto melhoram associatividade multi-hop (HippoRAG 2, ICML 2025, arXiv:2502.14802).
  Boa parte do que se pergunta a este copiloto é factual.
- GraphRAG-Bench (arXiv:2506.05690, 06/2025) abre reconhecendo que "GraphRAG frequentemente
  tem desempenho **inferior** ao RAG vanilla em muitas tarefas do mundo real".
- Microsoft GraphRAG está em **modo de manutenção** (sem novas features). Mem0 **abandonou o
  grafo externo** em favor de entity linking embutido e ainda ganhou +29,6 pts em raciocínio
  temporal. KuzuDB foi **arquivado** em out/2025.
- Dado já estruturado em SQL **não é caso de RAG**: "confundir pergunta com forma de
  *recuperação* com pergunta com forma de *computação* é a causa raiz nº 1 de números
  alucinados em agentes que falam com bancos de dados". Aqui isso já está certo — as
  ferramentas computam. Não regredir.
- Se um dia um grafo se justificar, **não sair do Postgres**: SQL/PGQ nativo chega no PG 19
  (GA prevista set/out 2026), declarando property graph **sobre as tabelas que já existem**.

### 3.2 Grafo de controle ≠ grafo de conhecimento

Palavras iguais, sistemas sem relação. Vale deixar escrito para não se confundir de novo:

| | Grafo de **controle** | Grafo de **conhecimento** |
|---|---|---|
| O que é | Máquina de estados do runtime do agente | Estrutura de dados sobre o mundo |
| Nó é | Passo de execução | Entidade ("Conta Bitcoin") |
| Exemplos | LangGraph, plan-then-execute | Neo4j, Graphiti, GraphRAG |
| Resolve | Determinismo, checkpoint, loops, depuração | Recuperação multi-hop, associação |
| Custo | ~zero (é só código) | LLM por escrita + índice + operação |

Grafo de controle **não está no escopo deste plano** e não resolve o sintoma relatado: o
copiloto não erra sequência de ferramenta, ele recebe dados pobres demais. Só entra na pauta
se aparecer evidência de erro de fluxo (repetir tool, não saber parar).

---

## 4. Ontologia — derivada do schema que já existe

**Nós** (todos com `donoId`, exceto `ItemPatrimonio`, que herda por `snapshotId` — ver R8):

```
Config · Ciclo · Categoria · Conta · CustoFixo · ProvisaoAnual
Parcelamento · Transacao · PagamentoFixo · SnapshotPatrimonio · ItemPatrimonio · Memoria
```

**Arestas que já são FK** — nada a fazer, só expor:

| Aresta | Schema |
|---|---|
| `Transacao -[CLASSIFICADA_EM]-> Categoria` | `:150-151` |
| `Transacao -[SAIU_DE / ENTROU_EM]-> Conta` | `:152-155` |
| `Transacao -[ABATE]-> ProvisaoAnual` | `:158-159` |
| `Transacao -[PARCELA_DE {parcelaNum}]-> Parcelamento` | `:162-164` |
| `Transacao -[COMPETE_A]-> Ciclo` | `:169-170` |
| `CustoFixo -[DEBITA_EM]-> Conta` | `:72-73` |
| `PagamentoFixo -[QUITOU {pagoEm}]-> CustoFixo` / `-[NO_CICLO]-> Ciclo` | `:102-103` |
| `ItemPatrimonio -[OBSERVA]-> Conta` (D-13) | `:257-258` |
| `Config -[DESTINO_SOBRA]-> Conta` | `:37-38` |

**Arestas a criar** — o trabalho de verdade:

| Aresta | Como | Fecha |
|---|---|---|
| `Parcelamento -[CLASSIFICADO_EM]-> Categoria` | promover `:193` a `@relation` | C2 |
| `CustoFixo -[CLASSIFICADO_EM]-> Categoria` | campo novo `categoriaId` | C2 (a grave) |
| `Transacao -[ESTORNA]-> Transacao` | promover `:167` a self-relation | C2 |
| `Ciclo -[ROLLOVER_PARA]-> Ciclo` | `cicloAnteriorId` FK | C2 |
| `Memoria -[FALA_SOBRE {tipoAlvo, alvoId}]-> {Categoria\|Conta\|Parcelamento\|ProvisaoAnual\|CustoFixo}` | tabela `MemoriaEntidade` | C3 |
| `Memoria -[SUPERSEDE]-> Memoria` | `substituiId` FK | C4 |

**Temporalidade.** O app já é bitemporal e não sabe:

| Entidade | Validade | Existe? |
|---|---|---|
| `CustoFixo` | `vigenteDe` / `vigenteAte` | **sim** (`:80-81`) |
| `Parcelamento` | `dataCompra` → `encerradoEm` | **sim** (`:192,199`) |
| `Ciclo` | `dataInicio` / `dataFim` | **sim** (`:212-213`) |
| `Transacao` | `data` (competência) + `createdAt` (registro) | **sim** (`:145,171`) — bitemporal de fato |
| `Memoria` | só `ativo` booleano | **NÃO** — o buraco (`:338`) |

Proposta para `Memoria`: `validoDe String` e `validoAte String?`, ambos data civil
`"YYYY-MM-DD"` (regra 2). `ativo` passa a ser derivado. **Nenhum campo `Cents` entra** — a
regra 7c continua absoluta, e âncora é `(tipoAlvo, alvoId)`, nunca valor.

---

## 5. Onde isso mora na hexagonal

```
src/
  domain/
    grafo/                        <- NOVO, puro, sem I/O
      ontologia.ts                  TipoNo, TipoAresta (uniões de string)
      vizinhanca.ts                 tipos de Vizinhanca<T>; regras de poda
      relevancia.ts                 ranking/poda de arestas por relevância
    memoria/
      regras.ts                     (existente — validarTextoMemoria INTOCADA)
      temporalidade.ts            <- NOVO, puro: vigente(memoria, hoje), supersessão
    ports/
      grafo.ts                    <- NOVO: GrafoPort { vizinhancaDe(tipo, id, opts) }
      memoria.ts                    (estender: validoDe/validoAte/ancoras)
  application/
    ia/ferramentas/
      contexto.ts                 <- NOVO: ferramentas contexto_de / historico_de
      saida.ts                      (estender: helper vizinhanca())
  infrastructure/
    repositories/
      prisma-grafo.ts             <- NOVO: joins Prisma; SQL cru só se precisar de CTE
      prisma-memoria.ts             (estender: âncoras + filtro temporal)
```

**Aderência às regras invioláveis:**

- **Centavos Int** — nós carregam `*Cents: Int` com par `*Formatado`. **Aresta nunca carrega
  dinheiro**: peso monetário em aresta é valor derivado sem suas partes, exatamente a D-15.
- **Data civil String** — `validoDe`/`validoAte` são `"YYYY-MM-DD"`, comparação lexicográfica,
  `hoje` vindo de `RelogioPort`.
- **`donoId` em tudo** — ver §7.
- **IA nunca grava (7b)** — `contexto_de` e a busca são leitura pura. `MemoriaEntidade` é
  escrita **só** na confirmação de `propor_memoria`, nunca por ferramenta.
- **Memória sem dinheiro (7c)** — `validarTextoMemoria` (`domain/memoria/regras.ts:125`)
  continua sendo a única porta de entrada.
- **Cálculo só em `domain/finance/` (regra 4)** — o grafo **não calcula dinheiro**; ele monta
  vizinhança. Todo número que sai continua vindo de função pura já testada.

---

## 6. Fases

Cada fase é entregável sozinha e tem critério de aceite verificável. **Reavaliar entre G0 e
G1** — é bem possível que G1 deixe de parecer necessária.

### G0 — Fechar as arestas quebradas · sem nenhuma IA envolvida

Promover `Parcelamento.categoriaId` e `Transacao.estornoDeId` a `@relation`; acrescentar
`CustoFixo.categoriaId`; acrescentar `Ciclo.cicloAnteriorId`. Migração com backfill
(`estornoDeId` já tem valores; `CustoFixo.categoriaId` nasce `null` e é preenchido pelo dono
na tela de custos fixos).

**Aceite:** `pnpm test` verde · `pnpm typecheck` limpo · `pnpm verificar:isolamento` verde ·
uma query Prisma devolve `parcelamento.categoria.nome` sem join manual · a análise por
categoria passa a **poder** incluir custo fixo.
**Custo:** meia sessão. **É o item de maior retorno do plano inteiro, e não tem nada a ver
com IA.**

### G4 — `divergencias` em `patrimonio_resumo` · independente, pode vir junto da G0

Emitir `divergenciasConciliacao`, já calculado em `application/patrimonio.ts:94`, com o
motivo em texto no padrão da D-14.

**Aceite:** a saída da ferramenta contém as divergências com nome da conta e par
`Cents`/`Formatado`; teste de que uma divergência conhecida aparece.
**Custo:** ~1h.

### G1 — `GrafoPort` + ferramenta `contexto_de`

Porta em `domain/ports/grafo.ts`, adapter `prisma-grafo.ts`, ferramenta
`contexto_de(tipo, id, profundidade ≤ 2)` devolvendo o nó, suas arestas e os vizinhos com id
e nome. Ferramentas de agregado passam a incluir `id` em cada linha (`gastos_por_categoria`
devolve `categoriaId`).

**Aceite:** dado um `categoriaId`, a saída traz as transações do ciclo, o parcelamento que
alimenta a categoria e o custo fixo ligado a ela · teste de isolamento provando que
`contexto_de` com id de outro dono devolve **vazio**, não erro que vaze existência · nenhum
campo monetário novo fora do par `Cents`/`Formatado` · **tokens por turno medidos antes e
depois** (ver R3).

### G2 — Memória temporal e ancorada

`Memoria.validoDe` / `validoAte` / `substituiId`; tabela `MemoriaEntidade`;
`domain/memoria/temporalidade.ts` puro. `buscarPorEmbedding` passa a filtrar por vigência em
`hoje` e a devolver as âncoras. `propor_memoria` ganha argumento opcional de âncora; a
gravação continua só na confirmação.

**Aceite:** teste puro de supersessão (B substitui A ⇒ A deixa de ser recuperada a partir do
`validoDe` de B) · teste de que `analise_corte` + memória ancorada em "Academia" fazem a
linha vermelha chegar ao contexto **sem depender do modelo chamar `buscar_memoria`** · teste
de que ancorar em entidade de outro dono é **rejeitado** · `validarTextoMemoria` inalterada
e ainda verde.

### G3 — Série temporal por entidade

Ferramenta `historico_de(tipo, id, numCiclos)`: valor por ciclo de uma categoria/conta/
parcelamento com o delta ciclo a ciclo, calculado em função pura nova em `domain/finance/`.

**Aceite:** "por que Alimentação subiu?" produz série + as transações que explicam o delta,
com `comoFoiCalculado` apontando para a função pura.

---

## 6.1 O que NÃO fazer

- **Não** instalar AGE, Neo4j, Memgraph, Graphiti ou cognee (ADR-16).
- **Não** vetorizar transação, categoria ou qualquer entidade financeira. Elas têm id e são
  consultáveis exatamente; embedding sobre elas só adiciona ruído — e um embedding de
  transação **contém o valor**, colidindo com o espírito da regra 7c.
- **Não** construir grafo de planejamento de ferramentas. 16 ferramentas, catálogo estável,
  sem dependências reais entre elas: um DAG sobre isso é cerimônia (§3.2).
- **Não** deixar a IA gravar aresta. Âncora nasce de proposta confirmada pelo dono (7b).
- **Não** criar tabela genérica `No`/`Aresta` espelhando as entidades. O grafo **são** as
  tabelas existentes; duplicá-las cria dois lugares para o mesmo fato divergir — o oposto do
  que a D-13 ensinou.
- **Não** aumentar `MAX_TURNOS` para compensar. Se o modelo precisa de mais de 6 turnos, o
  problema é a forma da saída, não o orçamento.

---

## 7. Multi-tenant — regras novas

Se este plano for adiante, estas quatro regras entram no `CLAUDE.md`:

1. **Toda tabela de aresta nasce com `donoId` próprio**, mesmo redundante com os dois nós —
   mesmo raciocínio já aplicado em `MensagemConversa.donoId` (`schema.prisma:379-384`).
   Permite filtrar e apagar por `(id, donoId)` sem join, que é o que `verificar-isolamento`
   confere linha a linha.
2. **Nenhuma aresta cruza donos.** `MemoriaEntidade` exige checagem explícita
   `memoria.donoId === alvo.donoId`. **FK sozinha não garante isso** — o Postgres aceitaria
   ligar a memória do dono A à categoria do dono B. É a vulnerabilidade nova que este plano
   introduz, e a mais fácil de esquecer.
3. **Toda CTE recursiva filtra `donoId` em TODOS os níveis** — âncora e passo recursivo.
   Filtrar só na âncora **vaza no segundo salto**. É a armadilha do SQL cru de
   `prisma-memoria.ts` elevada ao quadrado, porque numa recursiva o vazamento é silencioso e
   se multiplica.
4. **`pnpm verificar:isolamento` ganha um caso por tabela de aresta nova**, mais um caso
   específico: ancorar memória do dono A em entidade do dono B deve falhar.

---

## 8. Riscos

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | Vazamento entre donos em CTE recursiva (filtro só na âncora) | **Crítico e silencioso.** O pior desfecho possível deste plano | `donoId` em todo nível; caso dedicado em `verificar:isolamento`; profundidade máx. 2 na G1, evitando recursiva de início |
| R2 | Aresta cruzando donos em `MemoriaEntidade` — FK não impede | **Crítico** | Checagem explícita na escrita + teste negativo |
| R3 | **Explosão de contexto**: vizinhança grande, custo por turno sobe, modelo se perde num JSON de 8KB. Cura pior que a doença | **Alto e provável** | Teto duro de vizinhos por tipo de aresta; poda em `domain/grafo/relevancia.ts` (puro, testável); medir tokens/turno antes e depois — **se subir >40% sem melhora de resposta, reverter a G1** |
| R4 | Número aparecendo em aresta ou nó sem suas partes — recria a D-15 num lugar novo | Alto | Aresta nunca carrega dinheiro; nó monetário sempre com par `Cents`/`Formatado`; estender o teste que assere a convenção |
| R5 | Supersessão mal modelada faz sumir memória que ainda vale | Médio | `temporalidade.ts` puro com testes de tabela; `ativo` mantido numa fase de transição; tela de memória mostra vigência |
| R6 | Complexidade desproporcional ao volume — grafo formal sobre 13 parcelamentos vira cerimônia que ninguém mantém em 2 anos | **Médio e real** | G0 e G4 entregam a maior parte do valor sem nenhum conceito de grafo. Só seguir para G1+ se, depois da G0, uma pergunta concreta continuar irrespondível |
| R7 | Migração com dev server vivo — a armadilha recorrente do `CLAUDE.md` | Baixo, mas garantido se esquecer | `pnpm db:generate && rm -rf .next && pnpm dev` após cada migração |
| R8 | `ItemPatrimonio` sem `donoId` próprio (herda por `snapshotId`, `schema.prisma:243-261`). Como nó alcançável direto, fica sem escopo | Médio | Ou acrescentar `donoId`, ou proibi-lo como ponto de entrada de `contexto_de` (só alcançável via `SnapshotPatrimonio`) |

---

## 9. Premissas e perguntas em aberto

**Premissas** (confirmar antes de executar):

1. Volume permanece single-user: ~400-600 `Transacao`/ano, 13 parcelamentos, 10-12 custos fixos.
2. Postgres 16 local continua sendo o único banco. Sem plano de nuvem.
3. O modelo suporta bem 16+ definições de ferramenta; acrescentar 2-3 não degrada a escolha.
4. O dono aceita que a memória continue **sem números** — todo o plano depende disso.

**Perguntas que mudam o plano:**

1. **Qual pergunta concreta o copiloto respondeu mal?** "Falta contexto" tem sete causas
   (§2) com custos de correção muito diferentes. Um transcript real decide se isto é G0 ou G3.
2. **`CustoFixo` sem categoria é buraco conhecido e aceito, ou defeito?** Se for defeito, é o
   item nº 1 — e não é sobre IA.
3. Quanto o teto diário (`limite-ia.ts`) permite por pergunta hoje? Isso limita quanta
   vizinhança cabe na G1 (R3).
4. `patrimonio_resumo` sem `divergencias` foi omissão ou decisão? G4 é barata e independente.
5. A memória ancorada deve **entrar sozinha** no contexto quando a entidade é citada (G2), ou
   continuar sob decisão do modelo via `buscar_memoria`? A primeira é mais confiável e mais
   cara em tokens.

---

## 10. Se você só fizer uma coisa

**Faça G0 + G4.** Fechar `CustoFixo → Categoria`, `Parcelamento → Categoria`,
`Transacao → Transacao` e `Ciclo → Ciclo`, e emitir `divergencias` no patrimônio. Nenhum
conceito de grafo, nenhuma infra nova, nenhum turno a mais — e some a maior fonte de "falta
contexto": o copiloto deixa de trabalhar com um retrato onde **35% da renda não aparece em
nenhuma análise por categoria**.

Depois disso, reavalie.

---

## 11. Revisão de escopo — 24/08/2026 (decisão do dono)

O plano das §1-§10 responde *"por que o copiloto responde mal o que já sabe"*. O dono
explicitou a demanda real, que é maior: **que o agente tenha contexto suficiente sobre
qualquer coisa da situação financeira — hoje, amanhã, ontem, objetivos, investimentos
aportados, e o efeito de desviar parte da meta.**

Cobertura da demanda contra o que existe hoje:

| Demanda | Hoje | Onde é resolvida |
|---|---|---|
| Situação hoje, saldo do dia | `situacao_hoje`, `estado_ciclo` | já funciona |
| Amanhã, depois | `projetar_ciclos` | já funciona |
| **Ontem** / trajetória | não existe listagem de `Transacao` nem série | **G3** |
| **Objetivos a alcançar** | só intenção sem número (regra 7c) | **decidido: não mudar** (§11.1) |
| **Investimentos aportados** | derivável, mas nenhuma ferramenta lê | **G6** (§11.2) |
| **Desviar parte da meta** | nada varia a meta de poupança | **G7** (§11.3) |

### 11.1 Objetivos — regra 7c mantida literal

Avaliou-se promover `Objetivo` a entidade de primeira classe (`alvoCents Int`, `dataLimite`,
`contaId`), o que daria ao agente onde *lembrar* do alvo sem violar o espírito da 7c (número
auditável em coluna Int, não escondido num embedding).

**Decisão do dono: não mudar.** A 7c segue literal, `Memoria` segue sem número, e não nasce
tabela `Objetivo`.

**Consequência aceita, registrada aqui para não virar surpresa:** o alvo é **argumento de
pergunta, nunca estado do sistema**. `simular_meta_prazo` recebe `alvoCents` e `dataLimite`
na chamada; o dono repete o alvo a cada conversa; e o agente **não** consegue, por conta
própria, dizer "você está atrasado para os R$ 50.000 de dezembro" — porque não sabe que esse
alvo existe. Acompanhamento de objetivo continua sendo pergunta do dono, não iniciativa do
copiloto.

### 11.2 G6 — Aportes e rendimento (sem mudança de schema)

**Decisão do dono: não criar modelo `Aporte`.** O agente deve *identificar* o aporte a partir
do que já está gravado.

O ponto crítico, verificado no código: **entra dinheiro em conta de investimento por três
caminhos, e só um é `Transacao`.**

| Origem | Cria `Transacao`? | O que é |
|---|---|---|
| `Transacao` TRANSFERENCIA → `Conta` tipo INVESTIMENTO | **sim** | aporte manual, o único visível hoje |
| Sobra do fechamento creditada em `Config.destinoSobraContaId` | **não** — move `saldoCents` direto (`application/fechamento.ts`) | aporte automático do ciclo |
| `aceitarRealidade` (D-13, `application/patrimonio.ts:182`) | **não** — move `saldoCents` direto, por decisão explícita | **rendimento ou correção, NÃO aporte** |

Daí as duas armadilhas que a G6 existe para evitar:

- Ferramenta que lê **só `Transacao`** sub-reporta: some o aporte que veio da sobra do ciclo.
- Ferramenta que lê **só o delta de `saldoCents`** confunde aporte com rendimento — e
  rendimento é exatamente o sinal que a D-13 manda **não** destruir.

**Escopo:** ferramenta `aportes_do_periodo(contaId | null, dataInicio, dataFim)` que devolve,
**separado por origem**: aporte manual (soma das transferências), aporte automático (sobra
creditada, por ciclo fechado) e ajuste de conciliação (o que veio de `aceitarRealidade`),
cada um com par `Cents`/`Formatado` e `comoFoiCalculado`. O cálculo nasce como função pura em
`domain/finance/`.

**Aceite:** "quanto coloquei em Bitcoin este mês" devolve os três números separados e nunca um
total que os funda · uma sobra de fechamento creditada aparece como aporte automático · um
`aceitarRealidade` aparece como ajuste e **não** como aporte · teste de isolamento por `donoId`
· nenhum valor monetário novo fora do par `Cents`/`Formatado`.

**Dependência:** a parte de rendimento fica muito mais legível depois da **G4** (divergências
de conciliação saindo em `patrimonio_resumo`). Fazer G4 antes.

### 11.3 G7 — `simular_meta_poupanca`

Não existe ferramenta que varie a meta de poupança. `simular_renda` varia a renda;
`simular_meta_prazo` varia alvo e prazo. Pergunta hoje irrespondível: *"e se em outubro eu
poupar 12k em vez de 18k e usar 6k numa viagem — como fica novembro?"*

**Escopo:** `simular_meta_poupanca(metaHipoteticaCents | percentHipotetico, numCiclos)`,
reaproveitando `projetarComCenario` (`domain/finance/projecao.ts`), como `simular_renda` já
faz.

**Aceite:** a saída mostra ciclo a ciclo verba, parcelas comprometidas e verba livre sob a
meta hipotética · **deixa explícito que o ciclo em curso continua congelado** (regra 3) e que
a hipótese só vale do próximo ciclo em diante, no mesmo padrão textual de `simular_renda` ·
não grava nada e não toca a `Config` · teste comparando contra a projeção real.

### 11.4 Ordem revista

```
G0  arestas quebradas          <- maior retorno, sem IA
G4  divergências no patrimônio <- barata, destrava a G6
G6  aportes por origem         <- demanda explícita do dono
G7  simular meta de poupança   <- demanda explícita do dono
G3  série temporal ("ontem")   <- fecha o eixo do tempo
G1  contexto_de                <- reavaliar: pode deixar de ser necessária
G2  memória temporal/ancorada  <- reavaliar
```

G5 (`Objetivo` como entidade) foi **descartada** por decisão do dono — ver §11.1.

---

## 12. G8 — "Para onde vai a renda" (decidida em 24/08/2026)

Fase nova, nascida da pergunta 2 da §9 — respondida pelo dono: **custo fixo não pode ficar
invisível.** Ele está certo, e a apuração mostrou que o problema é maior (e mais deliberado)
do que "faltou uma FK".

### 12.1 O achado: a invisibilidade é sistemática, não acidental

`src/application/analise.ts:56` — `if (!cat || cat.grupo !== 'VARIAVEL' || t.provisaoId) continue;`

E o mesmo filtro aparece em **oito lugares**: `application/hoje.ts:99`,
`variaveis-view.ts:182`, `parcelados-view.ts:49`, `categoria-parcela.ts:50`,
`domain/finance/categorias.ts:47-48`, `components/transacoes/extrato-variaveis.tsx:212`.
`gastos_por_categoria` (`ferramentas/situacao.ts:91`) lê `painel.categorias`, que já chega
filtrado.

**Consequência para a C2:** mesmo com `CustoFixo.categoriaId` (G0), o custo fixo **continuaria
não aparecendo**. A FK que falta é a segunda tranca, não a primeira.

**E o filtro tem razão de ser: a regra 5** — *"nunca misture custo fixo/provisão com verba
variável em cálculo ou exibição"*. O app é um limitador de gasto variável; custo fixo já está
comprometido. Jogar o Aluguel como fatia na mesma pizza dos gastos variáveis faria
"Alimentação 28%" deixar de significar qualquer coisa.

**Portanto: não é conflito, é forma.** A resposta não é afrouxar o filtro nas telas existentes
— é uma visão nova, separada, que responde uma pergunta diferente.

| Pergunta | Tela | Escopo |
|---|---|---|
| "quanto posso gastar hoje?" | Hoje / Análise (existentes) | **só variável** — não mexer |
| "para onde vai minha renda?" | **G8, nova** | tudo |

### 12.2 A decomposição — e por que "parcelas" não é um bloco irmão

🔴 **Cuidado que decide a corretude da tela.** Pela **D-11**, cada parcela é uma `Transacao`
de grupo VARIAVEL e **consome** o teto como qualquer gasto. Listar "Parcelas" e "Variável"
como blocos lado a lado **conta os R$ 4.393,88 duas vezes** — exatamente o erro que a D-11
existe para impedir. Parcela é **subdivisão** da verba variável, não irmã dela.

A decomposição correta é a `composicaoDaVerba` (D-15, `ferramentas/saida.ts:40-65`) já
existente, estendida até o fim:

```
Renda do ciclo
├── Poupança (meta)
├── Custos fixos                 -> por categoria (precisa da G0)
├── Provisão mensal
├── (+/−) Rollover recebido      -> ajuste, pode ser negativo
└── Disponível para gastar       (= verbaVariavel no motor)
     ├── Parcelamentos do ciclo  -> as parcelas que caem neste mês
     └── Gastos eventuais do mês -> por categoria (= verbaLivre no motor)
```

Os blocos fecham em 100% da renda. `provisaoMensal` e `rollover` **não podem ser omitidos** —
sem eles a soma não fecha e o dono vai procurar o dinheiro que "sumiu".

### 12.2.1 🔴 Rótulos — a palavra "variável" tem dois sentidos e eles se atropelam

Vocabulário fixado com o dono em 24/08/2026. **Usar estes rótulos na UI e nas saídas de
ferramenta**, não os nomes internos do motor:

| Na tela / na saída da ferramenta | No motor | O que é |
|---|---|---|
| **Disponível para gastar** | `verbaVariavel` | o balde: renda − poupança − fixos − provisão (+ rollover) |
| **Parcelamentos do ciclo** | `parcelasComprometidas` | compromisso que o dono **já sabe que vem** |
| **Gastos eventuais do mês** | `verbaLivre` (e o realizado contra ela) | o que aconteceu ali naquele mês, **não** parcelamento |

O motor chama de `verbaVariavel` o **balde**; o dono chama de "gasto variável" o **gasto
eventual**. São coisas diferentes, e trocar uma pela outra na exibição produz dupla contagem.
Precedente registrado no `CLAUDE.md` (D-15): *"cuidado com rótulo ambíguo — 'antes de descontar
parcela' foi lido como 'nada foi descontado ainda'. O erro que isso causa é dupla contagem."*
Mesma armadilha, outro rótulo.

**Por que parcelamento fica DENTRO de "disponível para gastar" e não ao lado de custos fixos:**
quando cai a parcela do celular, ela come do mesmo teto diário que o iFood de sábado (D-11).
Promover "Parcelamentos" ao nível de topo conta os R$ 4.393,88 duas vezes e estoura a soma da
renda.

**Por que ainda assim são duas linhas distintas:** parcelamento é **compromisso** (já se sabe
que vem), gasto eventual é **escolha**. O número que responde "quanto posso gastar sem me
enrolar" é o segundo, nunca o primeiro.

### 12.3 Escopo

- Função pura nova em `domain/finance/` — a decomposição da renda do ciclo em blocos, com o
  detalhamento por categoria dentro de "custos fixos" e dentro de "verba livre". Reusa
  `composicaoDaVerba`; **não** duplica cálculo de verba.
- Caso de uso em `application/`, agregando `CustoFixo` por `categoriaId` (G0).
- Tela nova (ou aba dentro de `/analise` — decidir na implementação). Sem gráfico na tela
  Hoje (regra 9); esta é outra tela, então gráfico é permitido.
- Ferramenta de IA `para_onde_vai_a_renda`, seguindo a D-15: manda os blocos **com as partes**,
  nunca só percentuais.

### 12.4 Aceite

- A soma dos blocos é **exatamente** a renda do ciclo — teste puro com os números reais do
  dono (renda 30.000, meta 18.000, fixos 4.884, parcelas 4.393,88).
- **Parcelamentos aparecem como subdivisão de "disponível para gastar", nunca como bloco de
  topo** — teste que falha se a soma dos blocos de topo incluir parcelas separadamente (guarda
  da D-11).
- **"Parcelamentos do ciclo" e "Gastos eventuais do mês" são duas linhas distintas**, cada uma
  com seu total — nunca fundidas num único número (§12.2.1).
- Os rótulos da §12.2.1 são os usados na UI e na saída da ferramenta; `verbaVariavel` e
  `verbaLivre` não vazam como nome visível ao dono.
- Custos fixos aparecem agrupados por categoria (Moradia, Serviços, Saúde…), não como lista de
  10 nomes soltos.
- Custo fixo **sem** `categoriaId` cai num grupo "Sem categoria" **visível e com contagem** —
  D-14: o que não dá para classificar diz por quê, em vez de sumir.
- As telas Hoje e Análise **não mudam**: o filtro `grupo === 'VARIAVEL'` nos oito lugares fica
  como está (regra 5).
- `pnpm test` · `pnpm typecheck` · `next build` verdes.

### 12.4.1 🔴 Guarda herdada da G0 — categoria de custo fixo pode ser de grupo VARIAVEL

Achado da auditoria da G0 (24/08/2026). `CATEGORIAS_BASE` (`infrastructure/onboarding.ts:22-37`)
semeia 14 categorias e **todas as 14 são `VARIAVEL`** — nenhuma é `FIXO`. Restringir o select
da tela de custos fixos a `FIXO` deixaria o campo vazio para todo usuário existente, então
`GRUPOS_DE_CATEGORIA_DE_CUSTO_FIXO` (`application/categoria-custo-fixo.ts:37`) aceita
`FIXO` **e** `VARIAVEL`.

Consequência: **um `CustoFixo` pode carregar a categoria "Mercado", que é a mesma categoria em
que caem gastos de verba.** Hoje isso é inerte — nenhum cálculo lê `CustoFixo.categoriaId`, e
o filtro `grupo === 'VARIAVEL'` das telas opera sobre `Transacao`, não sobre `CustoFixo`.

**A G8 é a fase que torna isso perigoso.** Ela agrega `CustoFixo` e `Transacao` por
`categoriaId` na mesma visão. Cenário concreto de falha: "Mercado" soma R$ 800 de compras
(verba variável) + R$ 1.200 de um custo fixo que o dono classificou como "Mercado". O número
resultante não é gasto de verba nem custo fixo — **é a mistura que a regra 5 proíbe**, e
ninguém percebe porque a agregação é por `categoriaId` e o `grupo` some no caminho.

**Guarda obrigatória, critério de aceite da G8:** toda agregação que une `CustoFixo` e
`Transacao` **carrega a origem de cada parcela do total** (quanto veio de custo fixo, quanto
veio de gasto eventual), no espírito da D-15 — número derivado viaja com suas partes. Um total
por categoria que não diz de onde veio cada pedaço é o bug, não a soma.

### 12.5 Dependência e ordem

G8 **depende da G0** (`CustoFixo.categoriaId`) — sem ela a tela mostra 10 nomes soltos em vez
de categorias, que é metade do valor. A G0 sozinha **não entrega** esta tela; ela só destrava.

Ordem revista da §11.4:

```
G0  arestas quebradas          <- pré-requisito de tudo
G8  para onde vai a renda      <- a demanda do dono; precisa da G0
G4  divergências no patrimônio <- barata, destrava a G6
G6  aportes por origem
G7  simular meta de poupança
G3  série temporal ("ontem")
G1  contexto_de                <- reavaliar
G2  memória temporal/ancorada  <- reavaliar
```

**Pergunta 2 da §9 encerrada:** `CustoFixo` sem categoria era **defeito**, não buraco aceito.
