# Camada de IA — Plano de Implementação

> Documento de planejamento. **Não contém código de implementação.** A fonte de verdade do
> produto continua sendo `SPEC.md`; as regras invioláveis continuam sendo as de `CLAUDE.md`.
> Onde este plano toca uma regra existente, ele diz explicitamente qual.
>
> **Revisão de escopo (decisão do dono).** O caminho crítico agora é **A0 → C → D**: fundação
> enxuta, motor de projeção e copiloto. A **Fase A (import de PDF)** e a **Fase B (lançamento
> por linguagem natural)** foram **adiadas, não canceladas** — o conteúdo integral das tarefas
> está preservado na §9 e pode ser retomado sem replanejar do zero.

---

## 1. Visão geral

A IA entra no app como **uma** capacidade de linguagem — responder perguntas sobre a vida
financeira do usuário via tool calling — e **zero capacidade de cálculo**. Todo número que o
usuário vê continua saindo de função pura em `src/domain/finance/`, testada em Vitest.

O princípio que organiza tudo:

```
LLM = tradutor entre linguagem e estrutura.
Código puro = quem sabe quanto é.
Usuário = quem autoriza qualquer gravação.
```

### 1.1 Onde a camada encaixa na hexagonal existente

```
                        ┌───────────────────────────────────────────────┐
  app/ (App Router)     │  app/copiloto/page.tsx        (Fase D)        │
  src/components/       │  components/ia/*              (Fase D)        │
                        └───────────────────┬───────────────────────────┘
                                            │ server actions
                        ┌───────────────────▼───────────────────────────┐
  src/actions/          │  ia.ts                                        │
                        └───────────────────┬───────────────────────────┘
                                            │ criarDeps()
                        ┌───────────────────▼───────────────────────────┐
  src/application/      │  ia/copiloto.ts        (loop de tools)         │
   (casos de uso)       │  ia/prompt-sistema.ts                          │
                        │  ia/ferramentas/       (wrappers finos)        │
                        │  projecao.ts           (read-model da Fase C)  │
                        └───────┬───────────────────────┬───────────────┘
                                │ depende SÓ de portas  │ chama motor puro
             ┌──────────────────▼──────────┐   ┌────────▼──────────────────────┐
  src/domain/│ ports/ia.ts  ProvedorIAPort │   │ finance/projecao.ts     (NOVO)│
             │ ports/repositorios.ts       │   │ finance/  (todo o motor atual)│
             │ ports/relogio.ts            │   └───────────────────────────────┘
             └──────────────────┬──────────┘
                                │ implementada por
             ┌──────────────────▼────────────────────────────────────────┐
  src/infra/ │ ia/provedor-ia.ts · ia/esquema-json.ts · ia/config-ia.ts   │
             └────────────────────────────────────────────────────────────┘
                                │ montado em
                          src/composition.ts  →  criarDeps() ganha `ia?: ProvedorIAPort`
```

**Regra de dependência preservada:** `src/domain/` não importa `src/infrastructure/`, não
importa `@prisma/client` e **não importa nenhum SDK de IA**. A porta `ProvedorIAPort` é uma
interface TypeScript pura; o SDK só existe dentro de `src/infrastructure/ia/`.

**Este plano não tem nenhuma migração de schema.** Nem `prisma/schema.prisma`, nem
`prisma/migrations/`, nem `BACKUP_VERSION` são tocados. Isso saiu junto com a Fase A (a migração
`origem`/`hashImportacao` existia só para deduplicar importação) e é uma **redução de risco
relevante**: nenhum risco de perda de dado nos dados reais do dono, nenhum ciclo de
export→limpar→import a validar, e nenhuma exposição à armadilha recorrente do Prisma Client
velho documentada no `CLAUDE.md`. A Fase C lê parcelas futuras das `Transacao` que já existem.

### 1.2 As cinco travas que o plano impõe

Mantidas na íntegra. A coluna de garantia aponta para as tarefas **vivas**; onde a garantia
original morava numa fase adiada, está indicado onde ela volta.

| # | Trava | Onde é garantida |
|---|---|---|
| 1 | Dinheiro é `Int` em centavos, inclusive na saída do LLM | Argumentos de tool declarados com `z.number().int()` (D1); saída da projeção com teste que assere `Number.isInteger` em todo campo `*Cents` (C3). Volta a valer nos contratos de extração/lançamento quando A e B forem retomadas. |
| 2 | Data civil é `String` "YYYY-MM-DD" | Argumentos de tool com `.regex(/^\d{4}-\d{2}-\d{2}$/)` (D1) + `assertData` de `src/shared/data.ts`; `EntradaProjecao`/`CicloProjetado` sem nenhum campo `Date` (C1). |
| 3 | LLM nunca faz aritmética | Tools devolvem `{ valorCents, valorFormatado }`; o modelo repete a string (D1). Grep de aritmética nos wrappers (D2). |
| 4 | Nenhuma regra de cálculo em prompt | Toda conta nova vira função pura testada — a Fase C é exatamente isso; prompt de sistema auditado contra fórmula (D3). |
| 5 | Nada grava sem confirmação humana | O copiloto é **read-only**: não existe tool de escrita no catálogo (D1), e um teste prova que nenhuma tool chama método de escrita dos repositórios (D6). Quando A e B voltarem, a garantia é a tela de revisão (A8) e o modal de confirmação (B4). |

### 1.3 Contradições encontradas no repo — leia antes de executar

Levantadas na exploração do código; **não foram assumidas resolvidas**. Duas outras
contradições eram específicas do import de PDF (integração bancária na `SPEC.md` §2; API routes
na `SPEC.md` §8) e foram para a §9.1 junto com a Fase A.

1. **`CLAUDE.md` regra 9 / `SPEC.md` §13**: "sem dados fake/mock nas telas". Um copiloto que
   alucina um número viola isso de forma mais grave que um mock, porque parece verdade. Por
   isso a Fase D só responde número que veio de tool (tarefa D3, critério de aceite explícito).
2. **`Parcelamento` não tem data de término no schema** — mas ela é derivável
   (`dataCompra + numParcelas − 1` meses) e, melhor ainda, **todas as N parcelas já existem
   como `Transacao` com data de competência futura** (ver `criarParcelamento` em
   `src/application/transacoes.ts:179`). A projeção da Fase C lê as obrigações futuras do
   repositório de transações, não recalcula. **Nenhuma migração é necessária.**
3. **`CustoFixo` não tem data de término.** A projeção assume custo fixo constante em todos os
   ciclos projetados. Isso é uma simplificação declarada, não um bug (decisão D-7).
4. 🔴 **CRÍTICA — Parcela consome verba variável, não é deduzida da verba.**
   `verbaVariavelCents` (`src/domain/finance/verba.ts:72`) calcula
   `renda − poupança − fixos − provisão (+ rollover)` e **não subtrai parcelas**. As parcelas
   são `DESPESA` de categoria `VARIAVEL` e consomem o teto diário como qualquer gasto. O número
   útil para o usuário é `verbaVariavel − parcelasComprometidas = verba realmente livre`.
   **Quem projetar subtraindo parcela da verba produz número plausível e falso** — e a Fase C
   agora é caminho crítico, sem a Fase A dividindo atenção.
   Esta contradição é **critério de aceite explícito e testado** em C1, C2, C3 e C6, e gerou a
   decisão aberta **D-11**: o `CLAUDE.md` descreve o teto como derivado de
   "renda − fixos − parcelas − provisão − poupança", o que **não** é o que `verba.ts` faz.
   O dono precisa dizer qual dos dois está desatualizado. Não bloqueia começar a A0; **bloqueia
   fechar a C**.
5. **Não há infraestrutura de teste de componente React** (`vitest.config.ts` roda
   `environment: 'node'` e inclui só `src/**/*.test.ts`). Todos os testes deste plano são de
   função pura e de caso de uso com fakes — mesmo padrão de
   `src/application/__fakes__/fakes-ciclo-fechamento.ts`. Testar UI exigiria jsdom +
   testing-library, que **não** está no escopo pedido.

---

## 2. Pré-requisitos e dependências

**Antes de começar:**

- `pnpm test` verde e `pnpm typecheck` limpo no `main` atual (baseline).
- Decisão **D-11** (§6) encaminhada — não bloqueia a A0, bloqueia o fechamento da C.
- Nada mais. As decisões de provedor e de privacidade estão fechadas (§2.1).

### 2.1 Decisões já fechadas

**D-1 — Provedor e modelo. RESOLVIDA.** O provedor é **OpenAI** e o modelo é **`gpt-5.6-terra`**.
Preços vigentes por 1M de tokens:

| Modelo | Entrada | Saída | Papel |
|---|---|---|---|
| `gpt-5.6-sol` | $5,00 | $30,00 | flagship — não usado neste plano |
| **`gpt-5.6-terra`** | **$2,00** | **$12,00** | **padrão da Fase D** |
| `gpt-5.6-luna` | $0,20 | $1,20 | alto volume — sem consumidor neste escopo (ver §2.2) |

**D-2 — Dados financeiros reais podem sair da máquina? RESOLVIDA: SIM, sem ressalvas.** O dono
aceitou o envio à API da OpenAI. Consequências práticas para a execução:

- Deixa de existir requisito de extração local, de redação de valores ou de modelo local. O
  adapter fala direto com a API.
- **Não** derruba as demais travas: o copiloto continua read-only, o número continua vindo de
  função pura, e o custo por chamada continua sendo risco (§7) — privacidade resolvida não é
  custo resolvido.
- `IA_HABILITADA=false` continua sendo o default, agora por conservadorismo operacional
  (não ligar a camada antes de ela estar pronta), não por privacidade.

Variáveis de ambiente (nomes reais já usados pelo dono, lidas **somente** pelo adapter em
`src/infrastructure/ia/`):

| Variável | Papel |
|---|---|
| `OPENAI_API_KEY` | credencial |
| `OPENAI_MODEL` | modelo — `gpt-5.6-terra` |
| `IA_HABILITADA` | liga/desliga a camada inteira (default `false`) |

**A porta `ProvedorIAPort` (`src/domain/ports/ia.ts`) não conhece nenhuma dessas variáveis, nem o
nome "OpenAI".** O domínio continua agnóstico: o prefixo `OPENAI_` existe porque o adapter é
OpenAI-específico por natureza, e é o adapter quem resolve modelo e credencial.

> `OPENAI_MODEL_DOCUMENTO` **saiu do plano**. Existia só como plano B de leitura de documento,
> que era exclusivo da Fase A. Volta com ela.

### 2.2 Sobre um segundo slot de modelo para lote (`OPENAI_MODEL_BULK`)

**Recomendação mantida: não implementar nesta etapa.** O raciocínio de custo é correto — Terra é
desperdício para trabalho repetitivo — mas **o escopo atual não tem trabalho em lote**, e com a
Fase A adiada isso ficou ainda mais verdadeiro:

- O copiloto é interativo: uma pergunta por vez, poucos turnos, contexto pequeno. É exatamente
  onde qualidade de tool calling importa mais que preço por token.
- A detecção de assinaturas **já é código puro sem IA** (`detectarAssinaturas`,
  `src/domain/finance/analise.ts:114`). Não passa por modelo nenhum.
- A projeção (Fase C) não usa IA de forma alguma.
- Categorização em massa de transações antigas continua como consideração futura (§9.3), sem
  tarefa neste plano.

Wirar um segundo modelo agora dobraria a matriz de teste do adapter (dois perfis de tool calling,
dois perfis de erro) para zero consumidor real. **Reservar o nome** é barato e está previsto: a
tarefa A0.2b documenta `OPENAI_MODEL_BULK` como comentário no `.env.example`, sem nenhum caminho
de código lendo-o.

### 2.3 Dependências novas de pacote

Instaladas na tarefa A0.3, nunca antes:

| Pacote | Para quê |
|---|---|
| `openai` (SDK oficial) | adapter `ProvedorIAPort` |
| `zod-to-json-schema` | traduzir os schemas Zod dos **argumentos de tool** em JSON Schema, sem duplicar contrato |

`zod@^3.24.1`, `date-fns@^4.1.0` e `vitest@^3.0.2` já estão no `package.json` — reusar, não
trocar de versão. **Nenhuma dependência de extração de PDF** neste escopo.

---

## 3. Fase A0 — Fundação da camada de IA (enxuta)

> Pré-requisito da Fase D. Esforço: **P/M** (era M; encolheu com o corte de escopo).
> **Pode rodar em paralelo com a Fase C**, que não depende de IA.

### 3.1 O que foi cortado da porta, e por quê (YAGNI)

A porta original previa três métodos. O escopo real consome **um**:

| Método | Consumidor no escopo atual | Decisão |
|---|---|---|
| `completarComTools` | Fase D — loop do copiloto (D3) | **fica** |
| `lerDocumento` | nenhum (era exclusivo da Fase A) | **removido** |
| `completarComSchema` | nenhum (era exclusivo das Fases A e B) | **removido** — ver justificativa abaixo |

**Justificativa para cortar `completarComSchema` agora, apesar de B voltar um dia.** Método de
porta sem chamador é dívida disfarçada de previdência: entra na interface, entra no fake, entra
na matriz de teste do adapter, e ninguém descobre que está errado porque nada o exercita. O custo
de trazê-lo de volta é **baixo e conhecido**, porque a parte cara já fica pronta nesta fase:

- `esquema-json.ts` (Zod → JSON Schema estrito) **continua sendo construído na A0.3**, porque os
  argumentos de tool precisam exatamente dela;
- a validação de volta com Zod e o tratamento de `SCHEMA_INVALIDO` também já ficam prontos, pelo
  mesmo motivo.

Ou seja: quando a Fase B voltar, `completarComSchema` é um método a mais no adapter reusando
infraestrutura já testada — não um redesenho. **Structured output não sai do plano; só deixa de
ser um método de porta sem dono e passa a viver onde tem consumidor: os argumentos de tool.**

### Tarefa A0.1 — Definir a porta `ProvedorIAPort`

- **Agente:** `principal-architect`
- **Objetivo:** fixar a fronteira entre domínio e provedor de IA numa interface pura que reflete
  o escopo real (tool calling), para que trocar de modelo/fornecedor não toque em nenhum caso de uso.
- **Arquivos:**
  - criar `src/domain/ports/ia.ts`
  - modificar `src/application/deps.ts`
  - referência: `src/domain/ports/relogio.ts`, `src/domain/ports/repositorios.ts` (estilo e nível
    de documentação a seguir)
- **Critérios de aceite:**
  - [ ] `ProvedorIAPort` expõe **exatamente uma** capacidade assíncrona: `completarComTools(...)`.
        Nenhum método sem consumidor (ver §3.1). `lerDocumento` e `completarComSchema` **não**
        aparecem no arquivo, nem comentados como "futuro".
  - [ ] `completarComTools` recebe mensagens + definições de tool cujos argumentos são schemas
        **Zod** (`ZodType`), não JSON Schema — a tradução é responsabilidade do adapter.
  - [ ] O retorno é discriminado: **ou** uma lista de chamadas de tool, **ou** o texto final.
        Nunca os dois num objeto ambíguo que obrigue o chamador a adivinhar o estado do turno.
  - [ ] Nenhum import de `openai`, `@anthropic-ai/*`, `@prisma/client` ou `src/infrastructure/**`.
        `grep -rE "openai|infrastructure" src/domain/` volta vazio.
  - [ ] Nenhum nome de modelo no arquivo; a assinatura **não** tem parâmetro `model` obrigatório,
        e **nenhuma menção a "OpenAI"** — a porta não sabe qual provedor a implementa.
  - [ ] Erros do provedor são tipados no domínio: classe `ErroProvedorIA` com discriminante
        (`INDISPONIVEL | SCHEMA_INVALIDO | LIMITE_EXCEDIDO | CONTEUDO_RECUSADO`), no mesmo padrão
        de `CicloFechadoError` (`src/application/transacoes.ts:49`). `SCHEMA_INVALIDO` continua
        necessário: cobre argumento de tool que não bate com o schema declarado.
  - [ ] `Deps` (`src/application/deps.ts`) ganha `ia` como campo **opcional** (`ia?: ProvedorIAPort`),
        para que todo caso de uso existente continue compilando e o app funcione integralmente com
        a IA desligada.

### Tarefa A0.2 — Módulo de configuração do adapter

- **Agente:** `principal-architect`
- **Objetivo:** centralizar em um único módulo de infraestrutura a leitura de `OPENAI_MODEL`,
  credencial e flag de habilitação, com falha explícita quando faltar.
- **Arquivos:**
  - criar `src/infrastructure/ia/config-ia.ts`
  - modificar `README.md` (seção nova: "Camada de IA — configuração")
- **Critérios de aceite:**
  - [ ] `config-ia.ts` é o **único** arquivo do repo que lê `OPENAI_API_KEY` e `OPENAI_MODEL`.
        `grep -rn "OPENAI_" src/ --include=*.ts` só aponta para ele.
  - [ ] `grep -rn "OPENAI_\|process.env" src/domain/` volta vazio — env não vaza para o domínio,
        e o domínio não conhece o nome do provedor.
  - [ ] `OPENAI_MODEL` ausente → erro legível
        (`"OPENAI_MODEL não configurado — preencha no .env"`), nunca `undefined` chegando no SDK.
        Mesmo tratamento para `OPENAI_API_KEY`.
  - [ ] `OPENAI_MODEL_BULK` **não é lido por nenhum código** (ver §2.2) — só documentado no
        `.env.example` pela tarefa A0.2b.
  - [ ] Com `IA_HABILITADA=false`, `criarDeps()` devolve `ia: undefined` e **nenhuma** tela
        existente quebra (`pnpm build` verde, home carrega).
  - [ ] `.env` real não é commitado (já coberto pelo `.gitignore`; confirmar).

### Tarefa A0.2b — Documentar as variáveis no `.env.example`

- **Agente:** `principal-architect` · Depende de: A0.2
- **Objetivo:** deixar o `.env.example` — que hoje só tem `DATABASE_URL` — refletindo tudo que a
  camada de IA precisa, sem nenhum segredo real dentro.
- **Arquivos:** modificar `.env.example`
- **Critérios de aceite:**
  - [ ] Bloco novo "Camada de IA" com `IA_HABILITADA=false`, `OPENAI_API_KEY=` (vazio) e
        `OPENAI_MODEL=gpt-5.6-terra`, com comentário de uma linha explicando cada uma.
  - [ ] `OPENAI_MODEL_BULK` aparece **comentado**, com a nota de que `gpt-5.6-luna` está reservado
        para categorização em massa e **ainda não tem consumidor** (§2.2).
  - [ ] **Nenhuma chave real, nenhum token, nenhum valor de `OPENAI_API_KEY`** no arquivo.
        `git diff .env.example` revisado antes do commit.
  - [ ] `DATABASE_URL` e seus comentários existentes permanecem intactos.
  - [ ] Um `cp .env.example .env` + preenchimento só de `DATABASE_URL` deixa o app rodando
        exatamente como hoje (IA desligada).

### Tarefa A0.3 — Adapter concreto do provedor

- **Agente:** `elite-code-writer` · Depende de: A0.1, A0.2
- **Objetivo:** implementar `ProvedorIAPort` contra o SDK da OpenAI, incluindo a tradução
  Zod → JSON Schema dos argumentos de tool e a validação de volta com Zod.
- **Arquivos:**
  - criar `src/infrastructure/ia/provedor-ia.ts` (implementação de `ProvedorIAPort`)
  - criar `src/infrastructure/ia/esquema-json.ts` (Zod → JSON Schema)
  - modificar `src/composition.ts` (montar `ia` no bag de `Deps`)
  - modificar `package.json` (dependências novas)
- **Critérios de aceite:**
  - [ ] O model id vem **exclusivamente** de `config-ia.ts` (`process.env.OPENAI_MODEL`).
        `grep -rniE "gpt-|claude-|gemini|llama" src/` volta vazio — o nome do modelo mora no
        `.env`, nunca no código.
  - [ ] Os argumentos devolvidos pelo modelo em cada tool call são validados com o **mesmo**
        schema Zod que gerou o JSON Schema daquela tool; falha vira `ErroProvedorIA('SCHEMA_INVALIDO')`,
        nunca um objeto meio-preenchido passando adiante para o wrapper.
  - [ ] Em `SCHEMA_INVALIDO`, o adapter tenta **no máximo uma** re-solicitação com o erro de
        validação anexado; a segunda falha propaga.
  - [ ] `zod-to-json-schema` roda com `additionalProperties: false` e todos os campos obrigatórios
        explícitos (schema estrito).
  - [ ] Timeout e nº máximo de tentativas configuráveis, com defaults conservadores.
  - [ ] `criarDeps()` continua funcionando com `IA_HABILITADA=false` (campo `ia` ausente).
  - [ ] `pnpm typecheck` limpo, zero `any` (inclusive no ponto de contato com o SDK — se o SDK
        devolver `any`, converter via `unknown` + Zod).

### Tarefa A0.4 — Fake do provedor para testes

- **Agente:** `qa-test-engineer` · Depende de: A0.1
- **Objetivo:** permitir testar o copiloto de forma determinística, sem rede e sem custo.
- **Arquivos:**
  - criar `src/application/__fakes__/fake-provedor-ia.ts`
  - criar `src/application/__fakes__/fake-provedor-ia.test.ts`
  - referência de estilo: `src/application/__fakes__/fakes-ciclo-fechamento.ts`,
    `src/infrastructure/relogio/relogio-sistema.ts` (padrão `RelogioFixo`)
- **Critérios de aceite:**
  - [ ] `FakeProvedorIA` implementa `ProvedorIAPort` e responde a partir de uma **fila** de turnos
        pré-programados, sem nenhuma chamada de rede.
  - [ ] Sabe programar uma conversa de **múltiplos turnos**: turno 1 pede tool, turno 2 pede outra
        tool, turno 3 devolve texto final. Sem isso o loop da D3 não é testável.
  - [ ] Permite programar **falhas**: argumento de tool fora do schema, indisponibilidade, e
        modelo pedindo tool inexistente.
  - [ ] Registra as chamadas recebidas (mensagens, tools oferecidas, resultados devolvidos) para
        asserção nos testes.
  - [ ] O teste de fumaça prova que o fake satisfaz a porta e que os turnos saem na ordem programada.

### Tarefa A0.5 — Verificar tool calling e aderência de schema do modelo

> **Tarefa bloqueante da Fase D.** Nada de D1 em diante começa antes desta fechar.

- **Agente:** `principal-architect` · Depende de: A0.3
- **Objetivo:** provar empiricamente que `gpt-5.6-terra` faz tool calling com múltiplas tools
  disponíveis e respeita o schema estrito dos argumentos — antes de construir o catálogo de tools,
  os wrappers e a UI em cima dessa premissa.
- **Por que existe:** a página de preços da OpenAI **não discrimina capacidade por modelo dentro
  da linha 5.6**. A doc indica que toda a linha faz tool calling e structured outputs, mas isso é
  premissa *load-bearing* da Fase D inteira: o copiloto **só** funciona se o modelo escolher a
  tool certa entre várias e devolver argumentos válidos. Descobrir na tarefa D5 custa a fase toda.
  Mesmo espírito da verificação original de documento, redirecionada ao que sobrou no escopo.
- **Arquivos:**
  - criar `scripts/verificar-capacidade-ia.ts` (spike; **não** faz parte do app)
  - modificar `README.md` (registrar o resultado da verificação, com data)
- **Critérios de aceite:**
  - [ ] O spike roda contra `OPENAI_MODEL` (não contra um nome hardcoded).
  - [ ] **Múltiplas tools, não uma.** Oferece pelo menos 5 tools com descrições parecidas entre si
        (ex.: `situacao_hoje`, `estado_ciclo`, `projetar_ciclos`, `gastos_por_categoria`,
        `analise_corte`) e verifica que o modelo escolhe a certa para 3 perguntas distintas.
        Uma tool só não prova nada — o risco real é escolha errada entre opções próximas.
  - [ ] **Turno múltiplo:** verifica que o modelo, ao receber o resultado de uma tool, ou pede
        outra tool ou fecha com texto — e que o formato do turno seguinte é consumível.
  - [ ] **Aderência estrita de argumento:** uma tool com argumento
        `z.number().int()` e outra com data `regex(YYYY-MM-DD)`; confirma que os argumentos voltam
        no tipo declarado. Se o modelo devolver decimal onde o schema pede inteiro, ou data em
        `DD/MM/YYYY`, isso é achado **bloqueante** e muda D1.
  - [ ] **Recusa honesta:** faz uma pergunta que nenhuma tool cobre e registra se o modelo inventa
        número ou admite que não tem a informação. Esse é o comportamento que a D3 vai depender.
  - [ ] Mede e registra tokens de entrada/saída de uma conversa típica de 2–3 turnos, para dar
        número — e não palpite — à estimativa de custo por pergunta (alimenta o risco de custo da §7).
  - [ ] **Plano B, se a aderência de schema reprovar:** a porta já isola o problema (A0.1). A
        correção é validação + re-solicitação dentro do adapter (já prevista na A0.3) e, se ainda
        assim falhar, reduzir o catálogo a tools de argumento trivial (sem argumento, ou só enum),
        movendo a parametrização para o texto da pergunta. **Nenhum arquivo de `src/domain/` muda
        em nenhum dos casos.**
  - [ ] O spike **não** é importado por nenhum arquivo de `src/`; vive em `scripts/` e não entra no
        bundle. `pnpm build` verde depois de adicioná-lo.
  - [ ] Resultado escrito no `README.md` com a data da verificação — capacidade de modelo muda com
        o tempo e a próxima pessoa precisa saber quando isso foi verdade.

---

## 4. Fase C — Motor de projeção (código puro, sem IA)

> Esforço: **M**. **Zero dependência de IA** — pode começar imediatamente, em paralelo com a A0.
> É pré-requisito duro da Fase D (o pré-mortem de compra sai daqui).
>
> 🔴 **Atenção à contradição §1.3 item 4.** Ela é o modo de falha central desta fase e virou
> critério de aceite em C1, C2, C3 e C6. A decisão **D-11** precisa ser respondida antes de a
> C6 poder aprovar a fase.

### Tarefa C1 — Modelar entradas e saídas da projeção

- **Agente:** `principal-architect`
- **Objetivo:** definir os tipos da projeção de forma que a função seja pura, determinística e
  não precise de banco — no mesmo estilo de `src/domain/finance/tipos.ts`.
- **Arquivos:**
  - modificar `src/domain/finance/tipos.ts` (ou criar `src/domain/finance/projecao-tipos.ts` se
    o arquivo passar de ~120 linhas)
- **Critérios de aceite:**
  - [ ] `EntradaProjecao` contém: `dataBase` (`DataCivil`), `diaRecebimento`, `numCiclos`,
        `rendaPrevistaCents`, `metaPoupancaCents`, `metaPoupancaPercent`, `fixosCents`,
        `valoresProvisaoAnualCents: readonly number[]`, `destinoSobra`,
        `rolloverInicialCents`, e `obrigacoesFuturas: readonly ObrigacaoFutura[]`.
  - [ ] `ObrigacaoFutura` = `{ data: DataCivil; valorCents: number; parcelamentoId: string | null }`
        — modela as parcelas **já existentes como `Transacao`** (contradição §1.3 item 2).
        A projeção **não** regenera parcelas do passado.
  - [ ] `CenarioHipotetico` = `{ descricao; valorTotalCents; numParcelas; dataCompra: DataCivil }`,
        campo **opcional** da entrada. Um cenário é uma compra parcelada futura a simular.
  - [ ] `CicloProjetado` (saída, por ciclo) contém no mínimo: `inicio`, `fim`, `diasTotais`,
        `rendaPrevistaCents`, `poupancaAlvoCents`, `fixosCents`, `provisaoMensalCents`,
        `verbaVariavelCents`, `parcelasComprometidasCents`, `verbaLivreCents`,
        `verbaDiariaLivreCents`, `rolloverRecebidoCents`, `abaixoDoPiso: boolean`.
  - [ ] 🔴 **Contradição §1.3 item 4, travada no tipo.** `verbaVariavelCents` mantém **exatamente**
        a semântica de `src/domain/finance/verba.ts:72` — renda − poupança − fixos − provisão
        (+ rollover), **sem** subtrair parcela. `parcelasComprometidasCents` é um campo
        **separado**, e `verbaLivreCents = verbaVariavelCents − parcelasComprometidasCents` é
        documentado como **o** número que responde "quanto sobra de verdade". Os três campos
        coexistem justamente para que ninguém precise adivinhar qual é qual.
  - [ ] O comentário de cabeçalho do tipo declara, em uma frase, que parcela **consome** a verba
        variável (é `DESPESA` de grupo `VARIAVEL`) e **não** é deduzida dela no cálculo da verba —
        para que o próximo leitor não "corrija" o que está certo.
  - [ ] Todos os campos monetários terminam em `Cents` e são `number` inteiro.
  - [ ] Nenhum campo `Date`; toda data é `DataCivil`.

### Tarefa C2 — Implementar `projecao.ts`

- **Agente:** `elite-code-writer` · Depende de: C1
- **Objetivo:** projetar N ciclos à frente de forma determinística, reusando integralmente o
  motor existente.
- **Arquivos:**
  - criar `src/domain/finance/projecao.ts`
  - modificar `src/domain/finance/index.ts` (barrel)
  - reusar **obrigatoriamente**: `limitesCiclo`, `diasTotaisCiclo` (`ciclo.ts`),
    `provisaoMensalCents`, `poupancaAlvoCents`, `verbaVariavelCents` (`verba.ts`),
    `gerarParcelas` (`parcelamento.ts`), `verificarMetaIrreal` (`sugestoes.ts`),
    `somaCents`/`ratearCents` (`src/shared/dinheiro.ts`), `addDias`/`addMeses`/`estaNoIntervalo`
    (`src/shared/data.ts`)
- **Critérios de aceite:**
  - [ ] Exporta `projetarCiclos(entrada: EntradaProjecao): CicloProjetado[]` e
        `projetarComCenario(entrada, cenario: CenarioHipotetico): { base, comCenario, delta }`.
  - [ ] **Nenhuma fórmula é reimplementada.** Uma revisão manual confirma que o arquivo chama
        `verbaVariavelCents`, `poupancaAlvoCents`, `provisaoMensalCents` e `limitesCiclo` em vez de
        repetir as contas. Se alguma conta faltar no motor, ela vira função pura nova **testada**,
        não uma linha solta dentro de `projecao.ts`.
  - [ ] 🔴 **Contradição §1.3 item 4, travada na implementação.** `verbaVariavelCents` é obtido
        **chamando** a função existente com os mesmos argumentos que `garantirCicloAtual` usa
        (`src/application/ciclos.ts:70`) — sem nenhum parâmetro extra de parcela.
        `parcelasComprometidasCents` é calculado **depois e à parte**, somando as
        `obrigacoesFuturas` que caem no intervalo do ciclo. **Parcela aparece uma vez só, e nunca
        dentro de `verbaVariavelCents`.**
  - [ ] O cenário hipotético usa `gerarParcelas` para materializar as N parcelas — a soma das
        parcelas simuladas é **exatamente** `valorTotalCents` (`SPEC.md` regra 11).
  - [ ] `rolloverInicialCents` só propaga entre ciclos quando `destinoSobra === 'ROLLOVER'`, e a
        projeção assume **sobra zero** nos ciclos futuros (não pode adivinhar gasto futuro).
        Isso está documentado no cabeçalho do arquivo como premissa explícita.
  - [ ] `abaixoDoPiso` reusa `verificarMetaIrreal` contra `pisoDiarioVerbaCents`, e é avaliado
        sobre `verbaDiariaLivreCents` (verba **livre**, já descontada a parcela) — avaliar sobre a
        verba bruta esconderia exatamente o aperto que o usuário quer ver.
  - [ ] Função **pura**: sem `new Date()`, sem `Math.random()`, sem `await`, sem I/O. Duas chamadas
        com a mesma entrada devolvem estruturas idênticas (`deepEqual`).
  - [ ] `numCiclos` fora de `[1, 60]` lança `RangeError` (mesmo padrão de `gerarParcelas`).
  - [ ] Zero float em campo monetário; toda divisão usa `Math.floor` com resto tratado
        (`ratearCents`), conforme decisão acordada em `CLAUDE.md`.

### Tarefa C3 — Testes da projeção

- **Agente:** `qa-test-engineer` · Depende de: C2
- **Arquivos:** criar `src/domain/finance/projecao.test.ts`
- **Critérios de aceite:**
  - [ ] 🔴 **Teste de regressão da contradição §1.3 item 4 — o teste mais importante do arquivo.**
        Cenário com parcela ativa: assere simultaneamente que
        (a) `verbaVariavelCents` do ciclo projetado é **idêntico** ao que `verbaVariavelCents`
        (`verba.ts`) devolve chamado isoladamente com os mesmos parâmetros — provando que a parcela
        **não** foi subtraída dela; e
        (b) `verbaLivreCents === verbaVariavelCents − parcelasComprometidasCents`.
        Um teste adicional prova que a parcela **não é contada duas vezes**: dobrar o valor da
        parcela reduz `verbaLivreCents` em exatamente esse valor, e deixa `verbaVariavelCents`
        inalterado.
  - [ ] `diaRecebimento` 1, 5, 28 e 31 → os limites de cada ciclo projetado batem exatamente com
        `limitesCiclo` chamado isoladamente para a mesma data.
  - [ ] Projeção que cruza a virada de ano (dez → jan) e fevereiro (inclusive bissexto).
  - [ ] Parcelamento existente de 13 parcelas terminando no ciclo K: `parcelasComprometidasCents`
        é positivo até K e **zero** em K+1 — o "alívio" aparece na data certa, e `verbaLivreCents`
        sobe exatamente o valor da parcela em K+1.
  - [ ] Cenário "R$ 3.000 em 10x a partir do ciclo 2": a soma de `parcelasComprometidasCents`
        adicionadas nos 10 ciclos é **exatamente 300000**, e `delta` por ciclo é o valor da parcela.
  - [ ] Cenário que derruba `verbaDiariaLivreCents` abaixo do piso → `abaixoDoPiso: true` no ciclo
        correto, e **não** antes.
  - [ ] `metaPoupancaPercent` preenchida tem precedência sobre `metaPoupancaCents` em todos os
        ciclos projetados (decisão acordada em `CLAUDE.md`).
  - [ ] `destinoSobra !== 'ROLLOVER'` → `rolloverRecebidoCents === 0` em todos os ciclos ≥ 2.
  - [ ] Determinismo: mesma entrada, duas chamadas, `deepStrictEqual`.
  - [ ] Nenhum valor de saída é float: um teste itera a saída e assere `Number.isInteger` em todo
        campo terminado em `Cents`.
  - [ ] `pnpm test` verde.

### Tarefa C4 — Read-model: montar a entrada da projeção a partir do banco

- **Agente:** `elite-code-writer` · Depende de: C2
- **Objetivo:** dar às tools da Fase D uma forma única de obter a projeção real.
- **Arquivos:**
  - criar `src/application/projecao.ts`
  - reusar: `Deps`, `garantirCicloAtual` (`src/application/ciclos.ts:70`),
    `indexarGrupoCategoria`/`paraCalculo` (`src/application/mapeamento.ts`)
- **Critérios de aceite:**
  - [ ] `obterProjecao(deps, { numCiclos, cenario? }): Promise<ResultadoProjecao>` — **nenhum
        cálculo** no arquivo, só montagem de entrada + chamada a `projetarCiclos`
        (`CLAUDE.md` regra 4).
  - [ ] `obrigacoesFuturas` vem de `deps.transacoes.listarPorIntervalo(hoje, fimDoHorizonte)`
        filtrando `parcelamentoId != null` — a fonte de verdade é a `Transacao` já gravada,
        não uma regeneração a partir de `Parcelamento`. **Nenhuma migração envolvida.**
  - [ ] Os parâmetros do **ciclo atual** vêm do registro `Ciclo` congelado (não da `Config`);
        os dos ciclos **futuros** vêm da `Config` vigente. Essa distinção está documentada no
        arquivo e coberta por teste — confundi-las viola o congelamento da `SPEC.md` §5.2.
  - [ ] Config ausente → `ConfigAusenteError` (o erro que já existe), não erro genérico.
  - [ ] Read-only: nenhum método de escrita de repositório é chamado.

### Tarefa C5 — Testes do read-model de projeção

- **Agente:** `qa-test-engineer` · Depende de: C4
- **Arquivos:** criar `src/application/projecao.test.ts`
- **Critérios de aceite:**
  - [ ] Com fakes, prova que o ciclo 1 usa os valores **congelados** do `Ciclo` e o ciclo 2 usa os
        valores da `Config` (cenário: `Config` editada depois do ciclo nascer).
  - [ ] Prova que parcelas já gravadas aparecem em `parcelasComprometidasCents` **sem duplicar** —
        e que não aparecem também abatidas de `verbaVariavelCents` (contradição §1.3 item 4, agora
        no nível do read-model, onde o dado real entra).
  - [ ] Prova zero escrita.
  - [ ] Usa `RelogioFixo`, nunca a data real da máquina.
  - [ ] `pnpm test` verde.

### Tarefa C6 — Auditoria da Fase C

- **Agente:** `code-audit-engineer` · Depende de: C5, **e da resposta a D-11**
- **Critérios de aceite:**
  - [ ] 🔴 Confirma o tratamento da contradição §1.3 item 4 lendo o código, não os testes:
        `verbaVariavelCents` é chamado sem parâmetro de parcela; `parcelasComprometidasCents`
        é somado uma única vez; nenhuma subtração de parcela aparece dentro do cálculo da verba.
  - [ ] 🔴 **Bloqueia a aprovação da fase enquanto D-11 estiver sem resposta.** Se a resposta for
        "o `CLAUDE.md` está desatualizado", a auditoria inclui a correção do texto do `CLAUDE.md`.
        Se for "o código está errado", isso **não** é conserto de auditoria — vira tarefa nova de
        `elite-code-writer` sobre `verba.ts`, com regressão em `verba.test.ts`, e a Fase C é
        refeita em cima da fórmula corrigida.
  - [ ] Confirma que `projecao.ts` não reimplementou nenhuma fórmula do motor (checagem função a
        função contra `verba.ts`, `ciclo.ts`, `parcelamento.ts`).
  - [ ] Confirma pureza: `grep -nE "new Date|Math.random|await|prisma" src/domain/finance/projecao.ts`
        volta vazio.
  - [ ] `pnpm test` verde, `pnpm typecheck` limpo, zero `any`.

---

## 5. Fase D — Copiloto (agente com tool calling)

> Esforço: **G**. **Prioridade do dono.** Depende de A0 (fundação, incluindo a A0.5 bloqueante)
> e **de C completa** — o pré-mortem de compra sai da projeção.

Princípio da fase, em uma linha: **o modelo escolhe qual pergunta fazer ao código; o código
responde com o número; o modelo só narra.**

### Tarefa D1 — Catálogo de ferramentas

- **Agente:** `principal-architect` · Depende de: A0.1, **A0.5**, C4
- **Objetivo:** definir quais tools existem, com que schema de entrada e — o ponto crítico —
  com que formato de saída que impede o modelo de fazer conta.
- **Arquivos:** criar `src/application/ia/ferramentas/catalogo.ts` (nomes, schemas Zod, descrições)
- **Critérios de aceite:**
  - [ ] O catálogo cobre, no mínimo: `situacao_hoje` (teto/resta hoje), `estado_ciclo`
        (verba, ritmo, projeção de fechamento), `gastos_por_categoria`, `analise_corte`
        (3 ciclos), `assinaturas_detectadas`, `patrimonio_resumo`, `pagamentos_pendentes`,
        `projetar_ciclos`, `simular_compra_parcelada` (pré-mortem).
  - [ ] **Toda** tool devolve, para cada grandeza monetária, um par
        `{ <nome>Cents: number; <nome>Formatado: string }`, com `Formatado` produzido por
        `formatBRL` de `src/shared/dinheiro.ts`. O prompt do sistema instrui o modelo a **citar a
        string formatada**, nunca recompor o valor.
  - [ ] Toda tool devolve também `comoFoiCalculado: string` — o nome da função pura de origem
        (ex.: `"domain/finance/teto.ts: calcularTeto"`), para rastreabilidade e para a UI poder
        exibir a proveniência.
  - [ ] Cada tool tem um mapeamento 1:1 declarado com um caso de uso existente ou uma função pura
        existente. **Nenhuma tool sem origem em código já testado.** Toda tool que precisaria de
        conta nova está marcada `BLOQUEADA — exige função pura nova` e vira tarefa própria.
  - [ ] 🔴 As tools que expõem verba (`estado_ciclo`, `projetar_ciclos`,
        `simular_compra_parcelada`) devolvem `verbaVariavelCents` **e** `verbaLivreCents` **e**
        `parcelasComprometidasCents`, cada um com rótulo explícito de qual bolso é
        (`SPEC.md` §13: "não rotule um número sem dizer de qual bolso ele vem"). Devolver só um
        deles é o caminho mais curto para o copiloto dizer o número certo com o nome errado.
  - [ ] Nenhuma tool escreve no banco. Não há tool `criar_transacao`, `fechar_ciclo` ou
        `atualizar_config` neste escopo — o copiloto é **read-only** (decisão D-8).
  - [ ] Schemas de entrada em Zod, reaproveitáveis pelo adapter via `zod-to-json-schema` (A0.3),
        e **respeitando os achados de aderência da A0.5** (se o modelo não honrou algum tipo,
        o catálogo se ajusta em vez de insistir).

### Tarefa D2 — Implementar os wrappers de ferramenta

- **Agente:** `elite-code-writer` · Depende de: D1
- **Objetivo:** implementar cada tool como uma casca fina sobre caso de uso / função pura.
- **Arquivos:**
  - criar `src/application/ia/ferramentas/index.ts` e um arquivo por grupo
    (`situacao.ts`, `analise.ts`, `patrimonio.ts`, `projecao.ts`)
  - reusar: `obterEstadoHoje` (`hoje.ts`), `obterEstadoCiclo` (`ciclo-view.ts`), `obterAnalise`
    (`analise.ts`), `obterPatrimonio` (`patrimonio.ts`), `obterEstadoPainel` (`dashboard.ts`),
    `obterProjecao` (C4)
- **Critérios de aceite:**
  - [ ] Cada wrapper tem **≤ ~25 linhas** de corpo: chamar o caso de uso, formatar com `formatBRL`,
        devolver. Qualquer wrapper que precise de `if` sobre valor monetário é sinal de regra
        vazando — vira função pura em `src/domain/finance/` com teste.
  - [ ] `grep -nE "[-+*/] *[0-9]|Math\.(floor|round|ceil)" src/application/ia/ferramentas/` não
        encontra aritmética monetária. (Aritmética só existe no domínio.)
  - [ ] Nenhum wrapper chama método de escrita de repositório. Provado por teste (D6).
  - [ ] `simular_compra_parcelada` chama `projetarComCenario` (C2) — não recalcula parcela.
  - [ ] Erro de caso de uso vira retorno de tool legível (`{ erro: "..." }`), não exceção que mata
        o loop do agente.
  - [ ] Toda saída inclui `comoFoiCalculado` conforme D1.

### Tarefa D3 — Loop do agente

- **Agente:** `elite-code-writer` · Depende de: D2, A0.3
- **Objetivo:** orquestrar pergunta → tool calls → resposta, com limite de turnos e sem deixar o
  modelo produzir número fora de tool.
- **Arquivos:**
  - criar `src/application/ia/copiloto.ts`
  - criar `src/application/ia/prompt-sistema.ts`
- **Critérios de aceite:**
  - [ ] `responder(deps, { pergunta, historico }): Promise<RespostaCopiloto>` onde
        `RespostaCopiloto` inclui `texto`, `ferramentasUsadas[]` e `valoresCitados[]`.
  - [ ] Limite duro de turnos de tool calling (ex.: 6); excedido → resposta honesta de que não
        conseguiu concluir, **nunca** um palpite.
  - [ ] O prompt de sistema (`prompt-sistema.ts`) contém, textualmente: proibição de fazer
        aritmética, obrigação de citar a string `*Formatado` das tools, obrigação de dizer
        "não sei" quando nenhuma tool cobre a pergunta, e a regra de rótulo da `SPEC.md` §13
        ("não rotule um número sem dizer de qual bolso ele vem").
  - [ ] 🔴 **O prompt não contém nenhuma regra de cálculo.** Uma revisão confirma: nada de
        "verba = renda − poupança − fixos", nada de "verba livre = verba − parcelas". Se o modelo
        precisa disso, ele chama `estado_ciclo` e lê os três campos já calculados (D1).
  - [ ] Pergunta que exigiria conta inexistente → o copiloto responde que não tem esse número, e
        isso vira issue de "função pura nova", não gambiarra de prompt.
  - [ ] `deps.ia` ausente → erro legível; nenhuma outra tela é afetada.
  - [ ] Sem estado global; o histórico é passado por parâmetro (nada de `localStorage` como fonte
        de verdade — `CLAUDE.md` regra 6).

### Tarefa D4 — Server action do copiloto

- **Agente:** `elite-code-writer` · Depende de: D3
- **Arquivos:** criar `src/actions/ia.ts`
- **Critérios de aceite:**
  - [ ] `perguntarCopiloto(pergunta, historico)` devolve `Resultado<RespostaCopiloto>` no padrão
        de `src/actions/resultado.ts`; nenhuma exceção vaza para a UI (`SPEC.md` §8).
  - [ ] Tamanho de pergunta e de histórico validados com Zod (teto de turnos e de caracteres) —
        é a principal defesa de custo por chamada nesta fase.
  - [ ] **Não** chama `revalidatePath` (o copiloto é read-only).
  - [ ] Nenhuma regra de cálculo na action (`CLAUDE.md` regra 4) — só orquestração.
  - [ ] Se streaming for adotado (decisão D-9), fica isolado nesta camada — `copiloto.ts` continua
        com API não-streaming, testável.

### Tarefa D5 — UI do copiloto

- **Agente:** `elite-frontend-engineer` · Depende de: D4
- **Arquivos:**
  - criar `app/copiloto/page.tsx`
  - criar `src/components/ia/copiloto-chat.tsx`
  - criar `src/components/ia/resposta-com-proveniencia.tsx`
  - modificar `src/components/layout/sidebar.tsx`
  - reusar: `Card`, `Button`, `Input`, `EmptyState` de `src/components/ui/index.tsx`
- **Critérios de aceite:**
  - [ ] Toda resposta mostra, de forma discreta mas visível, **quais tools foram usadas** — o
        usuário consegue ver que o número veio do motor, não do modelo.
  - [ ] Números renderizados em `tabular-nums` (classe `tnum` já usada no projeto).
  - [ ] Estado vazio traz 3–4 perguntas de exemplo reais (ex.: "posso parcelar R$ 3.000 em 10x?",
        "o que corto para poupar R$ 500 a mais?"), sem dado fake na tela (`SPEC.md` §13).
  - [ ] Resposta sem tool nenhuma é sinalizada como opinião, não como dado.
  - [ ] Sem gamificação, sem elogio, sem emoji (`SPEC.md` §11).
  - [ ] Erro de provedor vira mensagem factual com o que fazer, não stack trace.
  - [ ] Com `IA_HABILITADA=false`, a rota não aparece na sidebar.

### Tarefa D6 — Testes da Fase D

- **Agente:** `qa-test-engineer` · Depende de: D3, A0.4
- **Arquivos:** criar `src/application/ia/copiloto.test.ts`,
  `src/application/ia/ferramentas/ferramentas.test.ts`
- **Critérios de aceite:**
  - [ ] Com `FakeProvedorIA` programado para chamar `simular_compra_parcelada`, o loop executa a
        tool, alimenta o resultado e produz resposta — o teste assere que a tool foi chamada com
        os argumentos certos.
  - [ ] Teste de limite de turnos: fake que pede tool infinitamente → loop corta e responde
        honestamente.
  - [ ] Teste de tool inexistente pedida pelo modelo → erro tratado, loop não quebra.
  - [ ] Teste de argumento de tool fora do schema → `ErroProvedorIA('SCHEMA_INVALIDO')` tratado,
        sem valor inválido chegando ao wrapper.
  - [ ] Teste prova que **nenhuma** tool chama método de escrita dos repositórios fake.
  - [ ] Teste prova que toda saída de tool com campo `*Cents` tem o `*Formatado` correspondente e
        que `formatBRL(Cents) === Formatado`.
  - [ ] 🔴 Teste prova que `estado_ciclo` devolve `verbaVariavelCents`, `verbaLivreCents` e
        `parcelasComprometidasCents` como campos distintos e coerentes entre si.
  - [ ] `pnpm test` verde, `pnpm typecheck` limpo.

### Tarefa D7 — Auditoria final da camada de IA

- **Agente:** `code-audit-engineer` · Depende de: todas
- **Critérios de aceite:**
  - [ ] `grep -rE "openai|anthropic|@ai-sdk" src/domain/ src/application/` volta vazio (SDK só em
        `src/infrastructure/ia/`).
  - [ ] `grep -rniE "gpt-|claude-|gemini|llama|model *[:=] *['\"]" src/` não encontra model id
        hardcoded.
  - [ ] Confirma que a porta continua com **um** método e nenhum método morto (§3.1).
  - [ ] Nenhum `any` novo; `pnpm typecheck` limpo.
  - [ ] Nenhum float monetário em nenhuma fronteira nova (schemas de tool, wrappers, action,
        componentes).
  - [ ] Nenhum `new Date(` com string de data civil.
  - [ ] Revisão do que trafega para a OpenAI numa conversa típica, listado explicitamente. Com
        D-2 resolvida isso não é mais um veto — é registro, para o dono saber o que ele aprovou.
  - [ ] Confirma que **nenhuma migração de schema** foi introduzida: `git diff` em
        `prisma/schema.prisma` e `prisma/migrations/` vazio (§1.1).
  - [ ] `pnpm test` verde e `pnpm build` verde.
  - [ ] `README.md`/`CLAUDE.md` atualizados com: a nova camada, as variáveis de ambiente e a regra
        "toda conta nova vira função pura, nunca prompt".

---

## 6. Decisões em aberto — exigem input do dono

Nenhuma tarefa acima assume resposta para estas. Onde havia default razoável, ele está marcado.

> **Resolvidas e movidas para a §2.1:** D-1 (provedor e modelo → OpenAI / `gpt-5.6-terra`) e
> **D-2 (dados podem sair da máquina → SIM, sem ressalvas)**.
>
> **Adiadas junto com suas fases (§9):** D-3 (extração de PDF local vs. API), D-4 (onde vive o
> rascunho de importação), D-6 (import de PDF vs. "sem integração bancária"), D-10 (campo de
> linguagem natural no mobile). Não são decisões pendentes do caminho crítico — voltam quando A
> e B voltarem.
>
> A numeração original foi preservada de propósito, porque as tarefas referenciam as decisões
> pelo número.

| # | Decisão | Por que trava | Default proposto |
|---|---|---|---|
| **D-5** | **Retenção e log das conversas.** | Guardar pergunta/resposta ajuda a depurar alucinação, mas cria um segundo lugar com dado financeiro na máquina. Com D-2 resolvida o dado já sai; isso é sobre o que **fica gravado localmente**. | Log local só de metadados (tool usada, latência, tokens), sem valores monetários e sem texto da conversa. Sem log de conteúdo por padrão. |
| **D-7** | **Custo fixo sem data de término na projeção.** | `CustoFixo` não tem `dataFim`. A projeção assume fixos constantes em todo o horizonte. Para 12 ciclos isso é otimista ou pessimista de forma silenciosa. | Assumir constante e declarar a premissa na saída da projeção (e portanto na resposta do copiloto). Adicionar `dataFim` a `CustoFixo` é escopo novo — não planejado aqui. |
| **D-8** | **O copiloto pode escrever?** | O plano o define como read-only. Um copiloto que lança gasto seria mais útil e muito mais perigoso — e é o que a trava 5 do §1.2 protege. | Read-only nesta entrega. Escrita, se um dia entrar, passa obrigatoriamente por um modal de confirmação humana. |
| **D-9** | **Streaming na resposta do copiloto?** | Melhora a percepção de velocidade, complica a server action e o teste. | Sem streaming nesta entrega; a resposta chega inteira. Reavaliar se a latência incomodar no uso real. |
| **D-11** 🔴 | **`CLAUDE.md` e `verba.ts` discordam sobre parcelas.** O `CLAUDE.md` diz que o teto é derivado de "renda − fixos − **parcelas** − provisão − poupança"; `src/domain/finance/verba.ts:72` calcula renda − poupança − fixos − provisão (+ rollover) e **não** subtrai parcelas — elas entram como `DESPESA` de grupo `VARIAVEL` e consomem a verba como gasto comum. | Um dos dois está desatualizado. Se for o `CLAUDE.md`, é correção de texto. Se for o código, a fórmula da verba muda e **todo ciclo já congelado no banco foi calculado com a fórmula antiga** — o que é problema de dado real, não de projeção. **Não bloqueia começar a A0; bloqueia fechar a Fase C** (critério de aceite da C6). | Plano assume que **o código está certo e o `CLAUDE.md` está impreciso**, porque o comportamento de `verba.ts` é coerente com `garantirCicloAtual`, com os ciclos gravados e com a suíte verde. Precisa de confirmação explícita antes da C6 aprovar. |

---

## 7. Riscos e mitigação

Tabela revisada para o escopo atual. **Cinco riscos foram removidos por terem morrido com a
Fase A** — não ficam como risco fantasma: layout de PDF imprevisível, importação duplicando
gastos, injeção via conteúdo do PDF, backup incompatível (`BACKUP_VERSION`) e Prisma Client velho
após migração. Os três últimos desapareceram porque **este plano não tem migração nenhuma**
(§1.1). Todos voltam com a Fase A, e a §9.1 preserva as mitigações.

| Risco | Impacto | Mitigação neste plano |
|---|---|---|
| 🔴 **Alucinação de número na resposta do copiloto** — *risco #1 do escopo atual* | Pior que mock na tela: parece verdade e o usuário não tem como conferir. Viola `SPEC.md` §13 e destrói a credibilidade que é o único produto do app. | Todo número vem de tool, com `*Formatado` e `comoFoiCalculado` (D1, D2); prompt proíbe aritmética e obriga citar a string formatada (D3); proveniência visível na UI, resposta sem tool marcada como opinião (D5); limite de turnos com falha honesta (D3); resposta "não sei" obrigatória quando nenhuma tool cobre (D3); teste que assere `formatBRL(Cents) === Formatado` (D6); a A0.5 verifica empiricamente, **antes** de construir, se o modelo admite não saber. |
| 🔴 **Regra de cálculo migrando para o prompt** | O motor puro deixa de ser a fonte de verdade e os números passam a variar entre execuções. Morte silenciosa da testabilidade — e não aparece em nenhum teste, porque o prompt não é testado. | Proibição explícita e auditada nos critérios de D1 e D3 (o prompt é lido linha a linha procurando fórmula); grep de aritmética nos wrappers (D2); tool sem origem em código testado é marcada `BLOQUEADA` no catálogo (D1); a Fase C existe justamente para que a conta que falta vire função pura testada em vez de frase no prompt; auditoria função a função em C6 e D7. |
| 🔴 **Rótulo errado sobre verba (contradição §1.3 item 4)** | O copiloto diz "você tem R$ X livres" citando `verbaVariavelCents` quando o número certo é `verbaLivreCents`. Apresenta como disponível dinheiro já comprometido com parcela — exatamente o que a `SPEC.md` §13 proíbe, e o erro é invisível porque o número é real. | Os três campos coexistem e são devolvidos juntos, com rótulo de bolso, pelas tools de verba (D1); prompt carrega a regra de rótulo da `SPEC.md` §13 (D3); teste de coerência entre os três campos (D6); regressão no motor provando que parcela não é contada duas vezes (C3); auditoria lê o código, não os testes (C6). |
| **Custo por chamada** | Terra custa $2,00/1M in e $12,00/1M out. Loop de agente sem limite, histórico crescendo sem teto ou chamada em render viram conta inesperada num app pessoal. Privacidade resolvida (D-2) **não** é custo resolvido. | Limite duro de turnos no agente (D3); teto de caracteres da pergunta e de turnos do histórico validado com Zod na action (D4); nenhuma chamada de IA em render de página — só por ação explícita do usuário; `IA_HABILITADA=false` por default; a A0.5 mede tokens de uma conversa típica de 2–3 turnos para dar número, e não palpite, à estimativa por pergunta. |
| **Regressão nas telas existentes** | A camada nova toca `Deps`, `composition.ts` e a sidebar — que estão em uso diário real, com os dados reais do dono. Quebrar a home para entregar um copiloto é um péssimo negócio. | `ia` é campo **opcional** em `Deps` (A0.1); com `IA_HABILITADA=false` o app é bit a bit o de hoje (A0.2, D5); **nenhuma migração de schema** (§1.1), então nenhum risco sobre os dados reais; a Fase C só adiciona arquivos novos em `src/domain/finance/` e `src/application/`, sem alterar `verba.ts`, `teto.ts` ou `ciclos.ts`; `pnpm test` + `pnpm typecheck` + `pnpm build` verdes como critério de C6 e D7. |
| **Capacidade de tool calling do modelo não é discriminada na página de preços** | A doc indica que toda a linha 5.6 faz tool calling e schema estrito, mas a página de preços não separa capacidade por modelo. Se `gpt-5.6-terra` escolher mal entre tools parecidas ou não honrar os tipos declarados, a Fase D inteira foi construída sobre premissa falsa. | **A0.5 é bloqueante da D1**: verifica empiricamente escolha entre 5 tools parecidas, turno múltiplo, aderência estrita de `int` e de data, e recusa honesta — tudo antes de escrever o catálogo. Plano B explícito: validação + re-solicitação no adapter (A0.3) e, no limite, catálogo com argumentos triviais. **Nenhum arquivo de `src/domain/` muda em nenhum cenário.** Resultado registrado no `README.md` com data. |

---

## 8. Esforço relativo e ordem de execução

| Fase | Esforço | Peso principal |
|---|---|---|
| **A0 — Fundação (enxuta)** | **P/M** | Encolheu com o corte: porta de **um** método, sem leitura de documento e sem structured output como método próprio. O custo concentra-se no adapter e na A0.5. |
| **C — Projeção** | **M** | Sem IA, sem UI, sem I/O, sem migração. O custo é acurácia de modelagem (contradição §1.3 item 4) e cobertura de teste — a parte mais fácil de acertar e a mais cara de errar. |
| **D — Copiloto** | **G** | Catálogo de tools + loop + UI de proveniência. Barato de fazer mal, caro de fazer de forma que não minta. É onde está a prioridade do dono e a maior parte do risco. |
| *A — Import de PDF (adiada)* | *G* | *Ver §9.1. Migração + dedup + tela de revisão linha a linha.* |
| *B — Linguagem natural (adiada)* | *P/M* | *Ver §9.2. Reusa o modal existente; independente da Fase A.* |

**Ordem recomendada:**

```
A0.1 → A0.2 → A0.2b → A0.3 → A0.4 → A0.5 ─┐
                                           ├──→ D1 → D2 → D3 → D4 → D5 → D6 → D7
C1 → C2 → C3 → C4 → C5 → C6 ───────────────┘
```

- **A0 e C rodam em paralelo desde o dia 1.** A Fase C não tem nenhuma dependência de IA — não
  precisa da porta, do adapter, nem da decisão de modelo. É o trabalho que pode começar agora,
  sem esperar nada.
- **D depende das duas:** de A0.5 (aprovada) e de C4 (o read-model que a tool de pré-mortem chama).
- **D-11 não bloqueia o início da C, bloqueia o fechamento dela** (C6). Encaminhar cedo.

---

## 9. Considerações futuras — fases adiadas e escopo não planejado

### 9.1 Fase A — Import de fatura/extrato em PDF (ADIADA, não cancelada)

> Esforço: **G**. Retomável sem replanejar: as tarefas abaixo estão preservadas na íntegra.
> Depende de A0 **acrescida de dois métodos na porta** (`lerDocumento` e `completarComSchema`,
> cortados por YAGNI — ver §3.1) e da verificação de capacidade de documento, que a A0.5 atual
> não cobre mais.

**Contradições da `SPEC.md` que voltam com esta fase:**

1. **`SPEC.md` §2 e `CLAUDE.md` regra 7** dizem "sem integração bancária / Open Finance na v1".
   Import de PDF **não é** integração bancária (é upload de arquivo, sem credencial de banco, sem
   API do banco), mas está a um passo dela. Exige confirmação do dono (decisão D-6).
2. **`SPEC.md` §8**: "Sem API routes, exceto export/import". O upload de PDF vai por **server
   action com `FormData`/`File`**, não por API route, para não abrir exceção nova (tarefa A7).
   Isso obriga a subir `serverActions.bodySizeLimit` em `next.config.ts` — hoje o default de
   1 MB derruba fatura escaneada.

**Decisões que voltam com esta fase:** D-3 (extração de PDF local vs. envio à API), D-4 (onde vive
o rascunho de importação), D-6 (integração bancária).

**Riscos que voltam com esta fase:** PDF de banco com layout imprevisível; importação duplicando
gastos; injeção via conteúdo do PDF; backup incompatível após a migração; Prisma Client velho após
migração (armadilha recorrente do `CLAUDE.md` — recuperação:
`pnpm db:generate && rm -rf .next && pnpm dev`).

**Pré-requisito extra na A0.5:** verificar `lerDocumento` com PDF **nativo e escaneado**, e
confirmar que `valorCents` volta inteiro no structured output. Plano B: `OPENAI_MODEL_DOCUMENTO`
usado **só** em `lerDocumento`, dentro do adapter.

Fluxo alvo, ponta a ponta:

```
upload PDF → lerDocumento → completarComSchema (linhas) → validação Zod (centavos/data)
   → deduplicação contra transações existentes (função PURA)
   → TELA DE REVISÃO: editar / aprovar / descartar linha a linha
   → confirmação explícita → criarTransacao / criarParcelamento (casos de uso EXISTENTES)
```

Nada é gravado antes do último passo. O rascunho vive no estado do cliente entre a extração e
a confirmação (ver decisão D-4 se isso precisar mudar).

#### Tarefa A1 — Contrato de extração (schema estruturado)

- **Agente:** `principal-architect` · Depende de: verificação de capacidade de documento
- **Objetivo:** definir o formato exato que o LLM deve devolver para cada linha de fatura, com
  centavos inteiros e data civil string, e o que é "não sei".
- **Arquivos:**
  - criar `src/application/importacao/contratos.ts` (schemas Zod + tipos derivados)
  - referência: `src/actions/transacoes.ts:17-45` (estilo de schema Zod já usado no projeto)
- **Critérios de aceite:**
  - [ ] `LinhaExtraidaSchema` contém no mínimo: `data` (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`),
        `valorCents` (`z.number().int().positive()`), `descricaoOriginal` (`z.string().min(1)`),
        `tipoSugerido` (`z.enum(['DESPESA','RENDA','TRANSFERENCIA','ESTORNO'])`),
        `metodoSugerido` (nullable), `categoriaSugeridaNome` (`z.string().nullable()` — **nome**,
        nunca id inventado), `parcela` (`{ atual, total }` nullable), `confianca` (0–1).
  - [ ] **Nenhum campo monetário aceita float.** Um teste prova que `47.5` é rejeitado por Zod.
  - [ ] `categoriaSugeridaNome` é explicitamente **nome textual**: o casamento com
        `Categoria.id` é feito por código na tarefa A5 — o modelo nunca cospe um cuid.
  - [ ] Existe um valor sentinela para "o modelo não conseguiu ler" (campo nullable + `confianca`
        baixa), e o contrato documenta que **linha ilegível é linha descartada, nunca chutada**.
  - [ ] O schema documenta, em comentário, que a instrução ao modelo pede **centavos inteiros**
        ("4750 para R$ 47,50"), nunca reais.
  - [ ] Documento é escrito em `src/application/`, não em `src/domain/` (é contrato de fronteira,
        não regra de cálculo).

#### Tarefa A2 — Migração: rastreabilidade e chave de deduplicação

- **Agente:** `principal-architect` · Depende de: A1
- **Objetivo:** dar a `Transacao` a origem e a impressão digital necessárias para deduplicar
  importações futuras sem heurística frágil.
- **Arquivos:**
  - modificar `prisma/schema.prisma`
  - criar migração em `prisma/migrations/` (via `pnpm db:migrate`)
  - modificar `src/domain/model/entidades.ts` (espelhar campos novos)
  - modificar `src/infrastructure/repositories/mappers.ts`
  - modificar `src/infrastructure/backup.ts` + `BACKUP_VERSION` (2 → 3)
- **Critérios de aceite:**
  - [ ] `Transacao` ganha `origem String @default("MANUAL")` (`MANUAL | IMPORTACAO | IA`) e
        `hashImportacao String?` com `@@index([hashImportacao])`.
  - [ ] Migração aplica limpa no `financial_dev` **com os dados reais do dono presentes**, sem
        perda: contagem de `Transacao` antes == depois, e toda linha antiga fica `origem="MANUAL"`.
  - [ ] `exportarTudo`/`importarTudo` (`src/infrastructure/backup.ts`) incluem os campos novos;
        `BACKUP_VERSION` sobe e o import aceita backup da versão anterior (migração de payload).
  - [ ] Ciclo de aceite do backup executado: export → banco limpo → import → estado idêntico
        (critério 9 da `SPEC.md` §12).
  - [ ] **Nenhum campo monetário novo.** Nenhum `DateTime` novo para data civil.
  - [ ] Após a migração, o dev server é reiniciado com `pnpm db:generate && rm -rf .next && pnpm dev`
        (armadilha documentada em `CLAUDE.md`).

#### Tarefa A3 — Deduplicação: função pura

- **Agente:** `elite-code-writer` · Depende de: A1, A2
- **Objetivo:** decidir, sem I/O, se uma linha extraída já existe entre as transações do período.
- **Arquivos:**
  - criar `src/domain/finance/importacao.ts`
  - modificar `src/domain/finance/index.ts` (barrel)
  - reusar: `normalizarDescricao` de `src/domain/finance/analise.ts:104`, `assertCentavos` e
    `somaCents` de `src/shared/dinheiro.ts`, `estaNoIntervalo`/`diffDias` de `src/shared/data.ts`
- **Critérios de aceite:**
  - [ ] Exporta `chaveDeduplicacao({ data, valorCents, descricao })` — determinística, estável e
        composta de `data + valorCents + normalizarDescricao(descricao)`. Chamar duas vezes com a
        mesma entrada devolve a mesma string.
  - [ ] Exporta `classificarLinhas({ linhas, existentes, toleranciaDias })` devolvendo, por linha,
        um veredito discriminado: `NOVA | DUPLICATA_EXATA | POSSIVEL_DUPLICATA` + referência à
        transação existente casada.
  - [ ] `DUPLICATA_EXATA` exige mesma data, mesmo `valorCents` e mesma descrição normalizada.
  - [ ] `POSSIVEL_DUPLICATA` cobre o caso real de fatura: mesmo valor e descrição, data
        deslocada em até `toleranciaDias` (default 3) — porque a data de competência da compra e
        a data que a fatura imprime divergem.
  - [ ] Uma transação existente é casada **no máximo uma vez**: duas linhas idênticas de R$ 30 no
        mesmo dia contra **uma** existente produzem `DUPLICATA_EXATA` + `NOVA`, nunca duas
        duplicatas (o usuário realmente pode ter almoçado duas vezes no mesmo lugar).
  - [ ] Reusa `normalizarDescricao` — `grep -c "function normalizar" src/domain/finance/` continua
        devolvendo 1.
  - [ ] Função pura: sem `new Date()`, sem `await`, sem import de `src/infrastructure/**`.

#### Tarefa A4 — Testes da deduplicação

- **Agente:** `qa-test-engineer` · Depende de: A3
- **Arquivos:** criar `src/domain/finance/importacao.test.ts`
- **Critérios de aceite:**
  - [ ] Caso "duas compras idênticas no mesmo dia" (uma existente, duas extraídas) → exatamente
        uma `DUPLICATA_EXATA` e uma `NOVA`.
  - [ ] Caso "data deslocada 2 dias" com `toleranciaDias=3` → `POSSIVEL_DUPLICATA`; com
        `toleranciaDias=1` → `NOVA`.
  - [ ] Caso "mesmo valor, descrição diferente" → `NOVA`.
  - [ ] Caso "descrição com caixa/acento/espaço diferentes" → casa (via `normalizarDescricao`).
  - [ ] Caso "virada de mês": 31/01 vs 01/02 dentro da tolerância não usa `new Date(string)` e não
        retrocede um dia (regressão do bug UTC da `SPEC.md` §5.1).
  - [ ] Caso "lista de existentes vazia" → todas `NOVA`, sem exceção.
  - [ ] `pnpm test` verde.

#### Tarefa A5 — Caso de uso: extrair fatura (não grava nada)

- **Agente:** `elite-code-writer` · Depende de: A0.3, A1, A3
- **Objetivo:** orquestrar `lerDocumento` + `completarComSchema` + dedup e devolver rascunhos
  prontos para revisão, sem tocar no banco.
- **Arquivos:**
  - criar `src/application/importacao/extrair-fatura.ts`
  - reusar: `Deps` (`src/application/deps.ts`), `indexarGrupoCategoria`/`paraCalculo`
    (`src/application/mapeamento.ts`), `classificarLinhas` (A3), `limitesCiclo`
    (`src/domain/finance/ciclo.ts`)
- **Critérios de aceite:**
  - [ ] Assinatura `extrairFatura(deps, { bytes, mimeType, contaIdSugerida? }): Promise<RascunhoImportacao>`.
  - [ ] **Zero escrita:** `grep -nE "\.criar|\.atualizar|\.salvar|\.excluir"` no arquivo volta
        vazio. Um teste (A9) prova que nenhum método de escrita dos repositórios fake foi chamado.
  - [ ] O casamento `categoriaSugeridaNome → categoriaId` é feito **em código**, contra
        `deps.categorias.listar()`, com normalização; nome não reconhecido vira `categoriaId: null`
        e a linha é marcada "precisa categoria", nunca cai numa categoria aleatória.
  - [ ] As transações existentes para dedup são buscadas por
        `deps.transacoes.listarPorIntervalo(inicio, fim)` derivado do range de datas das linhas
        extraídas, com folga de `toleranciaDias`.
  - [ ] Toda data vinda do modelo passa por `assertData` antes de qualquer uso; falha vira linha
        rejeitada com motivo, não exceção que derruba a importação inteira.
  - [ ] Linhas com `valorCents` não inteiro são rejeitadas com motivo explícito.
  - [ ] `deps.ia` ausente (IA desligada) → erro de domínio legível, não `TypeError`.
  - [ ] Nenhum cálculo monetário no arquivo além de somatório para exibição — e esse somatório
        usa `somaCents`.

#### Tarefa A6 — Caso de uso: confirmar importação (grava)

- **Agente:** `elite-code-writer` · Depende de: A2, A5
- **Objetivo:** gravar apenas as linhas que o usuário aprovou, reusando os casos de uso de
  transação já existentes — sem caminho de escrita paralelo.
- **Arquivos:**
  - criar `src/application/importacao/confirmar-importacao.ts`
  - reusar: `criarTransacao`, `criarParcelamento` de `src/application/transacoes.ts`
- **Critérios de aceite:**
  - [ ] Grava **exclusivamente** via `criarTransacao`/`criarParcelamento` existentes — nenhuma
        chamada direta a `deps.transacoes.criar*`. Isso preserva de graça: efeito em saldo de
        conta, efeito em provisão, vínculo de ciclo por data e a guarda de ciclo fechado.
  - [ ] Linha marcada como parcelada (`parcela: { atual, total }`) com `atual === 1` cria um
        `Parcelamento`; com `atual > 1` cria transação simples e **avisa** que as parcelas
        anteriores não foram importadas (não inventa histórico).
  - [ ] Toda transação gravada sai com `origem="IMPORTACAO"` e `hashImportacao` preenchido.
  - [ ] Linhas classificadas `DUPLICATA_EXATA` **não são gravadas** a menos que o usuário as tenha
        marcado explicitamente como "importar mesmo assim".
  - [ ] Se alguma linha cair em ciclo fechado, o `CicloFechadoError` é propagado como pedido de
        confirmação (padrão de `ResultadoRetroativo`, `src/actions/transacoes.ts:53`) — nunca
        `confirmarRetroativo: true` implícito.
  - [ ] Retorna um resumo `{ gravadas, ignoradas, falhas[] }`; uma falha isolada não aborta as
        demais, e o resumo diz qual linha falhou e por quê.

#### Tarefa A7 — Server actions de importação

- **Agente:** `elite-code-writer` · Depende de: A5, A6
- **Objetivo:** expor extração e confirmação à UI no padrão `Resultado<T>` já usado, com limite
  de upload adequado.
- **Arquivos:**
  - criar `src/actions/importacao.ts`
  - modificar `next.config.ts` (`experimental.serverActions.bodySizeLimit`)
  - referência: `src/actions/transacoes.ts`, `src/actions/resultado.ts`
- **Critérios de aceite:**
  - [ ] Duas actions: `extrairFatura(formData)` e `confirmarImportacao(linhasAprovadas)`, ambas
        devolvendo `Resultado<T>` / `ResultadoRetroativo<T>`. Nenhuma exceção vaza para a UI
        (`SPEC.md` §8).
  - [ ] Upload por **server action com `File`**, não por API route — a exceção de API route da
        `SPEC.md` §8 continua valendo só para backup.
  - [ ] `bodySizeLimit` elevado (mín. 10 MB) com comentário explicando o motivo; PDF acima do
        limite devolve erro legível ("arquivo maior que X MB"), não estouro de runtime.
  - [ ] Validação de `mimeType` (`application/pdf`) e tamanho **antes** de qualquer chamada ao
        provedor — nunca pagar token para rejeitar depois.
  - [ ] `revalidatePath` das rotas afetadas só **após** a confirmação (extração não muda dado, não
        revalida nada).
  - [ ] Nenhuma regra de cálculo dentro da action (`CLAUDE.md` regra 4) — só orquestração.

#### Tarefa A8 — Tela de revisão de importação

- **Agente:** `elite-frontend-engineer` · Depende de: A7
- **Objetivo:** dar ao usuário controle linha a linha antes de qualquer gravação, no visual e nos
  componentes que o app já usa.
- **Arquivos:**
  - criar `app/importar/page.tsx`
  - criar `src/components/importacao/upload-fatura.tsx`
  - criar `src/components/importacao/tabela-revisao.tsx`
  - criar `src/components/importacao/linha-revisao.tsx`
  - modificar `src/components/layout/sidebar.tsx` (entrada de navegação)
  - reusar: `Button`, `Card`, `Input`, `Select`, `Modal`, `ConfirmInline`, `EmptyState` de
    `src/components/ui/index.tsx`; `formatBRL` de `src/shared/dinheiro.ts`
- **Critérios de aceite:**
  - [ ] Cada linha tem três estados explícitos: **aprovar**, **editar**, **descartar**. O default
        de uma linha `POSSIVEL_DUPLICATA` é **descartada**, e de uma `NOVA` com categoria
        resolvida é **aprovada**.
  - [ ] Botão de gravação diz quantas linhas serão gravadas e o total em `formatBRL`; fica
        desabilitado com zero aprovadas.
  - [ ] O campo de valor editável acumula centavos dígito a dígito, exatamente como
        `src/components/dashboard/lancamento-painel.tsx:155` (`handleValorKeyDown`) — **nada de
        `Number()` ou `parseFloat` sobre texto livre**.
  - [ ] Linha duplicata mostra **ao lado** a transação existente que casou (data, valor, descrição),
        para o usuário decidir com informação, não no escuro.
  - [ ] `confianca` baixa é sinalizada por texto + ícone, nunca só por cor (`SPEC.md` §7.1,
        acessibilidade).
  - [ ] Números em `tabular-nums` (classe `tnum` já usada no projeto).
  - [ ] Estado vazio (nenhum PDF enviado) é convite à ação, sem dado fake (`SPEC.md` §13).
  - [ ] Recarregar a página com a revisão pendente **não grava nada** e avisa que o rascunho se
        perde (consequência aceita da decisão D-4).
  - [ ] Rota funciona em ≥1024px; no mobile é aceitável degradar para "use no desktop" —
        importação de fatura não é caso de uso de fila de caixa.

#### Tarefa A9 — Testes de aplicação da Fase A

- **Agente:** `qa-test-engineer` · Depende de: A5, A6, A0.4
- **Arquivos:** criar `src/application/importacao/extrair-fatura.test.ts`,
  `src/application/importacao/confirmar-importacao.test.ts`
- **Critérios de aceite:**
  - [ ] Teste prova que `extrairFatura` **não chama nenhum método de escrita** dos repositórios
        fake (asserção sobre spies, não inspeção visual).
  - [ ] Teste com `FakeProvedorIA` devolvendo valor float → linha rejeitada, importação segue.
  - [ ] Teste com data em formato errado ("29/07/2026") → linha rejeitada com motivo.
  - [ ] Teste com `categoriaSugeridaNome` inexistente → `categoriaId: null`, nunca categoria errada.
  - [ ] Teste de `confirmarImportacao` prova que só as linhas aprovadas viram `Transacao` e que
        `origem="IMPORTACAO"` foi setado.
  - [ ] Teste de linha em ciclo fechado → `CicloFechadoError` propagado, nada gravado.
  - [ ] `pnpm test` verde, `pnpm typecheck` limpo.

#### Tarefa A10 — Auditoria da Fase A

- **Agente:** `code-audit-engineer` · Depende de: A2–A9
- **Critérios de aceite:**
  - [ ] Confirma que nenhum float monetário existe no caminho PDF → banco (`grep -nE
        "parseFloat|Number\(|\* 100|/ 100"` nos arquivos novos, cada ocorrência justificada).
  - [ ] Confirma que `new Date(` não aparece com string de data civil em nenhum arquivo novo.
  - [ ] Confirma que `src/domain/` não ganhou import de `src/infrastructure/` nem de SDK.
  - [ ] Confirma que não há caminho de gravação que pule a confirmação do usuário.
  - [ ] Revisa o que é enviado ao provedor: o PDF inteiro sai da máquina? Há dado além do
        necessário? Registra para o dono (D-2 já autoriza o envio; isto é registro, não veto).
  - [ ] `pnpm build` verde.

### 9.2 Fase B — Lançamento por linguagem natural (ADIADA, não cancelada)

> Esforço: **P/M**. **Independente da Fase A** — pode ser puxada isoladamente a qualquer momento,
> sem esperar o import de PDF. Precisa apenas de A0 acrescida do método `completarComSchema` na
> porta (cortado por YAGNI — ver §3.1; o `esquema-json.ts` e a validação com Zod já ficam prontos
> na A0.3, então o retrabalho é um método no adapter, não um redesenho).
>
> Regra dura, preservada: **reusar o modal de lançamento existente**, não criar um segundo fluxo.
>
> **Decisão que volta com esta fase:** D-10 (campo de linguagem natural no mobile vs. o orçamento
> de 3 toques da `SPEC.md` §7.1).

#### Tarefa B1 — Contrato do rascunho de lançamento

- **Agente:** `principal-architect` · Depende de: A0.1 + `completarComSchema` restaurado
- **Objetivo:** definir o schema estruturado que traduz "almoço 47 reais no cartão" em campos do
  formulário que já existe.
- **Arquivos:** criar `src/application/ia/contratos-lancamento.ts`
- **Critérios de aceite:**
  - [ ] `RascunhoLancamentoSchema` tem: `valorCents` (int positivo), `data` (regex YYYY-MM-DD,
        nullable → cliente usa "hoje"), `descricao` (nullable), `categoriaSugeridaNome`
        (string nullable), `metodoSugerido` (`enum` de `METODO_PAGAMENTO` ou null),
        `contaSugeridaNome` (nullable), `confianca` (0–1).
  - [ ] O contrato **não** tem `categoriaId`/`contaId` — ids são resolvidos por código (B2).
  - [ ] Expressões relativas ("ontem", "sexta passada") são resolvidas **em código** na B2: o
        contrato prevê `dataRelativa` (`z.enum(['HOJE','ONTEM','ANTEONTEM']).nullable()`) além de
        `data` absoluta, e a aritmética usa `addDias` de `src/shared/data.ts`. O modelo nunca
        calcula uma data a partir de "hoje".
  - [ ] Um teste prova que `"valorCents": 47.5` e `"valorCents": "4750"` são rejeitados.
  - [ ] Documentado que a instrução ao modelo pede centavos ("47 reais → 4700").

#### Tarefa B2 — Caso de uso: interpretar lançamento

- **Agente:** `elite-code-writer` · Depende de: B1
- **Objetivo:** transformar texto livre em rascunho com ids resolvidos, sem gravar nada.
- **Arquivos:**
  - criar `src/application/ia/interpretar-lancamento.ts`
  - reusar: `normalizarDescricao` (`src/domain/finance/analise.ts:104`),
    `ordenarCategoriasPorUso` (`src/domain/finance/categorias.ts:41`), `addDias`
    (`src/shared/data.ts`), `deps.relogio.hoje()`
- **Critérios de aceite:**
  - [ ] Assinatura `interpretarLancamento(deps, texto): Promise<RascunhoResolvido>` — devolve
        rascunho, **nunca** `Transacao`.
  - [ ] **Zero escrita**, provada em teste.
  - [ ] `categoriaSugeridaNome` → `categoriaId` por casamento normalizado contra
        `deps.categorias.listar()`; sem casamento, `categoriaId: null` e a UI cai na categoria
        default do formulário (que o usuário vê e pode trocar).
  - [ ] `dataRelativa` é convertida com `addDias(deps.relogio.hoje(), n)` — nunca `new Date()`,
        nunca aritmética feita pelo modelo.
  - [ ] Texto sem valor monetário identificável → resultado explícito "não entendi o valor", com
        o formulário abrindo em branco. Nunca chuta um valor.
  - [ ] `deps.ia` ausente → erro legível; o modal continua funcionando na digitação manual.
  - [ ] Sem cálculo monetário no arquivo (o valor vem pronto do contrato, validado como int).

#### Tarefa B3 — Server action de interpretação

- **Agente:** `elite-code-writer` · Depende de: B2
- **Arquivos:** modificar `src/actions/ia.ts` (criado na D4)
- **Critérios de aceite:**
  - [ ] `interpretarLancamento(texto: string): Promise<Resultado<RascunhoResolvido>>` no padrão
        `src/actions/resultado.ts`.
  - [ ] Limite de tamanho do texto (ex.: 300 chars) validado com Zod antes de chamar o provedor.
  - [ ] **Não chama `revalidatePath`** — interpretar não muda estado.
  - [ ] Nenhuma regra de cálculo na action.

#### Tarefa B4 — Campo de linguagem natural no modal existente

- **Agente:** `elite-frontend-engineer` · Depende de: B3
- **Objetivo:** adicionar uma entrada de texto que **preenche** o formulário atual; o botão
  "Salvar" continua sendo o único caminho de gravação.
- **Arquivos:**
  - modificar `src/components/dashboard/lancamento-painel.tsx` (desktop, caso primário)
  - modificar `src/components/hoje/lancamento-rapido.tsx` (mobile — ver critério de escopo abaixo)
  - reusar: `Input`, `Button` de `src/components/ui/index.tsx`
- **Critérios de aceite:**
  - [ ] **Nenhum componente novo de lançamento é criado.** O campo entra dentro do `Modal` que já
        existe, acima do campo de valor.
  - [ ] Interpretar **preenche** `centavos`, `categoriaId`, `metodo`, `data`, `descricao` do estado
        do formulário e devolve o foco ao campo de valor. **Não** submete.
  - [ ] Os campos preenchidos por IA são visualmente sinalizados (ex.: rótulo "sugerido") e
        continuam 100% editáveis; a sinalização some ao editar.
  - [ ] O contrato de teclado atual é preservado: `N` abre, `Tab` percorre, `Enter` submete, `Esc`
        pede confirmação de descarte quando há valor digitado
        (`lancamento-painel.tsx:250`, `pedirFechamento`). Um valor **sugerido pela IA** conta como
        valor digitado para efeito do descarte.
  - [ ] `Enter` no campo de texto livre dispara **interpretar**, não **salvar** — dois `Enter`
        seguidos nunca gravam sem o usuário ter visto os campos.
  - [ ] Estado de erro ("não entendi o valor") aparece com `role="alert"`, no padrão já usado.
  - [ ] Com `IA_HABILITADA=false`, o campo simplesmente **não é renderizado** e o modal fica
        idêntico ao de hoje.
  - [ ] No mobile (`lancamento-rapido.tsx`): o campo é adicionado **só se** não custar o orçamento
        de 3 toques da `SPEC.md` §7.1. Se conflitar, deixar apenas no desktop (decisão D-10) —
        o orçamento de fricção vence a feature.

#### Tarefa B5 — Testes da Fase B

- **Agente:** `qa-test-engineer` · Depende de: B2, A0.4
- **Arquivos:** criar `src/application/ia/interpretar-lancamento.test.ts`
- **Critérios de aceite:**
  - [ ] "almoço 47 reais no cartão" com fake devolvendo `4700` → `valorCents === 4700`,
        `metodo === 'CREDITO'`.
  - [ ] Fake devolvendo float ou string em `valorCents` → rejeição, nada de coerção silenciosa.
  - [ ] `dataRelativa: 'ONTEM'` com `RelogioFixo` em `2026-03-01` → `2026-02-28`; testar também
        `2024-03-01 → 2024-02-29` (ano bissexto).
  - [ ] Categoria inexistente → `categoriaId: null`, sem exceção.
  - [ ] Asserção de zero escrita nos repositórios fake.
  - [ ] `pnpm test` verde.

### 9.3 Escopo nunca planejado

Registrado para não virar scope creep silencioso. **Nenhum item tem tarefa neste documento.**

- Tela dedicada de projeção/simulação (`/projecao`) — hoje a projeção só aparece via copiloto.
- `CustoFixo.dataFim` para projeção mais fiel (ver D-7).
- Staging persistente de importação (`ImportacaoFatura`) se D-4 mudar.
- Categorização automática em lote de transações antigas sem categoria — **é este o consumidor
  que justificaria `OPENAI_MODEL_BULK` / `gpt-5.6-luna`** (§2.2).
- Copiloto com capacidade de escrita (ver D-8).
- Infraestrutura de teste de componente (jsdom + testing-library) para cobrir D5 (e, quando
  voltarem, A8 e B4) — hoje o `vitest.config.ts` roda só `environment: 'node'`.
