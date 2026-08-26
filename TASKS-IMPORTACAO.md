# Importação e conciliação de fatura — Plano de Implementação

> Documento de planejamento. **Não contém código de implementação.** A fonte de verdade do
> produto continua sendo `SPEC.md`; as regras invioláveis continuam sendo as de `CLAUDE.md`.
> Os blocos de código aqui são **pseudocódigo de desenho**, não implementação.
>
> **Origem** — 24/08/2026. O dono pediu: anexar um documento com gastos (ex.: fatura de
> cartão) no app, comparar com o que já está registrado (custos fixos, parcelas, variáveis),
> conciliar o que existe e criar o que não existe — parcela como parcelamento, gasto único
> como variável.
>
> **Relação com planos existentes.** Este documento **ressuscita e atualiza a Fase A** do
> `TASKS-IA.md` §9.1 (import de PDF, adiada e não cancelada) contra o código de agosto/2026,
> acrescentando a parte que a §9.1 não cobria: **conciliação com o que já existe**. Depende
> da **G0** do `TASKS-GRAFO.md`.

---

## 1. Veredito

1. A Fase A original continua **estruturalmente correta** (contrato → dedup pura → tela de
   revisão → casos de uso existentes). Nada dela vai fora.
2. Ela é **insuficiente para esta demanda, e de um jeito perigoso**: concilia só contra
   `Transacao`. **Custo fixo e provisão não são `Transacao`** — importar uma fatura que os
   contém, do jeito que A3/A5/A6 estão escritas, **duplica R$ 4.884/mês e corrompe o teto
   diário**.
3. Três critérios de aceite da §9.1 estão **factualmente errados** contra o código de hoje (§3).
4. **Word está fora, permanentemente.** Imagem e PDF escaneado ficam fora da v1. O caminho de
   maior retorno e menor risco — que a §9.1 não previa — é **colar texto**.
5. A parte difícil não é extração, é **confirmar 40 linhas sem violar a 7b**. Resposta: a
   importação **deixa de ser conversa e vira tela**, o LLM entra **uma única vez**
   (transcrever), e a confirmação é **por faixa de risco**, com bloco permitido **apenas**
   para linhas decididas por função pura — nunca por inferência do modelo.

---

## 2. O que da Fase A original continua válido

| Item da §9.1 do TASKS-IA.md | Estado |
|---|---|
| Fluxo `extrair → dedup pura → revisão → confirmar → casos de uso existentes` | **válido, é a espinha** |
| A1 — contrato Zod, `valorCents` int, data regex, `categoriaSugeridaNome` **nome, nunca id** | válido (padrão provado em `application/ia/propostas.ts:73-84`) |
| "linha ilegível é linha descartada, nunca chutada" | válido e reforçado — é a D-14 aplicada à importação |
| A3 — `chaveDeduplicacao`, casamento 1-para-1, tolerância de dias | **núcleo válido**, mas cobre 1 dos 4 destinos possíveis (§6) |
| A3 — reusar `normalizarDescricao` (`domain/finance/analise.ts:104`) | válido |
| A5 — casamento nome→id **em código**, nunca id vindo do modelo | válido (já é o padrão em `ferramentas/escrita.ts:101-118`) |
| A6 — gravar **exclusivamente** via `criarTransacao`/`criarParcelamento` | válido e inegociável |
| A8 — valor editável acumulando centavos dígito a dígito | válido |
| A10 — auditoria por grep (float, `new Date(`, infra no domínio) | válido |

**Melhorou desde a §9.1:** `paraJsonSchemaEstrito` (`infrastructure/ia/esquema-json.ts`) já
existe e é exercitado pelas 16 ferramentas → restaurar `completarComSchema` na porta é **um
método**, não redesenho. O padrão proposta/confirmação existe e é testado. O teto de custo
existe (`application/limite-ia.ts:16-19`, 50 req/dia e 500k tokens/dia sobre `model UsoIA`).

---

## 3. O que envelheceu — três critérios de aceite hoje falsos

### 3.1 🔴 "`CicloFechadoError` é propagado" (A6) — não acontece

`criarTransacao` (`application/transacoes.ts:158`) **não checa ciclo fechado e não usa
`confirmarRetroativo`**. Chama `exigirEscrita`, `resolverCicloId` (`:153-156`) e grava.
`confirmarRetroativo` só é consumido em `editarTransacao` (`:262`); `ParcelamentoInput`
(`:44-52`) nem tem o campo.

**Importar fatura é retroativo por definição** — a fatura de agosto lista compras de julho. O
que na tela de lançamento é caso de canto, aqui é o caminho principal. Do jeito atual, uma
importação injeta transações em ciclos já fechados, alterando o gasto realizado de um ciclo
cuja sobra já foi creditada.

**Consequência:** a guarda de retroatividade é **da importação**, em função pura. Linha cuja
data cai em `Ciclo.fechado === true` nasce na faixa "precisa de você", nunca no bloco
automático, e exige `confirmarRetroativo` explícito por linha.

### 3.2 "Upload por server action com `bodySizeLimit`" (A7) — desaconselhado

Não existe bloco `experimental` em `next.config.ts` (default de 1 MB). O precedente real de
arquivo no app é **API route**: `app/api/backup/route.ts` — `exigirOwnerNaRota()` (`:19-34`),
CSRF via `origemSuspeita()` (`:43-54`), teto por `content-length` **antes** de ler o corpo
(`:16`, 25 MB, checado em `:83-89` → 413).

Subir `serverActions.bodySizeLimit` é **global**: enfraquece toda server action do app para
beneficiar uma. **Recomendação: `app/api/importacao/route.ts` copiando as três guardas do
backup.** Extração e confirmação seguem como server actions no padrão `Resultado<T>`; só o
upload de bytes vai pela rota.

### 3.3 "`hashImportacao String?` com `@@index`" (A2) — fraco demais

Índice não impede nada. A FK `Transacao.itemImportadoId String? @unique` impede **no banco**
que um item vire duas transações, e ainda dá o caminho de volta ("de onde veio esse
lançamento?") — exatamente o que D-13/D-14/D-15 vêm pedindo.

---

## 4. Restrições verificadas no código

### 4.1 Infra de IA — o que existe e o que falta

| Pergunta | Resposta |
|---|---|
| Provedor | OpenAI `^7.3.0`, `/v1/responses` (`infrastructure/ia/provedor-ia.ts:146`) |
| A porta suporta anexo/visão? | **Não.** `ProvedorIAPort` tem um método, `completarComTools` (`domain/ports/ia.ts:79`); `MensagemIA` (`:36-40`) só admite `conteudo: string` |
| O loop aceita anexo? | **Não.** `responder(deps, { pergunta: string, historico? })` (`copiloto.ts:157-160`) |
| Arquivo em `MensagemConversa`? | **Não.** `papel`, `conteudo String`, `proveniencia Json?` (`schema.prisma:394-406`) |
| Cabe no teto de custo? | **Sim, com folga.** Fatura de 40 linhas como texto ≈ 8k tokens contra 500k/dia. **Custo não é o gargalo** — precisão e privacidade são |
| Parser de PDF / OCR? | **Zero.** Nada de `pdf`, `tesseract`, `mammoth`, `sharp`, `multer` |

🔴 **Achado colateral:** `UsoIA` **não tem `donoId`** — é o único repositório montado sem
escopo (`composition.ts:114`). O teto é global entre donos. Não é criado por este plano, mas
este plano aumenta a pressão. Registrar como dívida.

🔴 **Achado operacional:** `IA_TIMEOUT_MS` default 60s (`config-ia.ts`). Uma chamada única
devolvendo 40 itens estruturados **vai raspar ou estourar**. Mitigação: fatiar em blocos de
~20 linhas (N chamadas curtas, cada uma um registro de `UsoIA`).

### 4.2 🔴 `parseBRL` não pode tocar texto de fatura

`shared/dinheiro.ts` `parseBRL` remove pontos e troca vírgula por ponto:

- `"R$ 1.234,56"` → 123456 ✅ · `"1234,56"` → 123456 ✅ · `"1234"` → 123400 ✅
- **`"1234.56"` → 12345600 ❌ — 100× errado, sem exceção nenhuma**

É o formato de extrato exportado, CSV e PDF de bandeira internacional.

**Regra dura: `parseBRL` nunca toca texto de fatura.** O modelo devolve **centavos inteiros**
(`z.number().int().positive()`), validado por Zod — contrato já provado em
`propostaLancamentoSchema` (`propostas.ts:74-78`). Se houver parser local por regex, ele ganha
função nova e própria — `parseValorFatura` — que **rejeita o ambíguo** em vez de adivinhar.
Nada de heurística silenciosa em dinheiro.

### 4.3 Dependência do TASKS-GRAFO.md — G0 antes

Não bloqueia, mas deve vir antes. `CustoFixo` **não tem `categoriaId`** (`schema.prisma:64-86`):
quando 10 linhas da fatura casarem com custos fixos (R$ 4.884), a conciliação **não consegue
dizer em que categoria o dinheiro caiu**. É a C2 do `TASKS-GRAFO.md`. G0 custa meia sessão.

### 4.4 🔴 O espelho da §11.2 do GRAFO — a armadilha central

A §11.2 do `TASKS-GRAFO.md` documenta que *dinheiro entra* em conta por três caminhos e só um
cria `Transacao`. **O lado da despesa tem a simetria exata:**

| Dinheiro sai por | Cria `Transacao`? | Já foi descontado da verba? |
|---|---|---|
| Gasto variável / parcela | **sim** | não — a `Transacao` é que consome o teto |
| **Custo fixo** | **não** | **sim** — congelado em `Ciclo.fixosCents` no nascimento do ciclo |
| Gasto de provisão | sim, com `provisaoId` | sim — abate `ProvisaoAnual` e o motor exclui `provisaoId != null` |

**Um importador que só conhece a primeira linha desta tabela conta o custo fixo duas vezes.**
Esta tabela entra no `CLAUDE.md`.

---

## 5. Extração — uma recomendação por tipo

| Fonte | v1? | Por quê |
|---|---|---|
| **Texto colado** (`textarea`) | ✅ **primeiro caminho a construir** | Zero dependência nova, zero upload, zero bytes em disco; cobre app de banco que não emite PDF; reusa 100% do pipeline. Provavelmente resolve metade da demanda sozinho |
| **PDF nativo (texto)** | ✅ segundo caminho. Extrair texto **localmente** com `unpdf` (ESM, mantido — `pdf-parse` está abandonado e quebra em ESM), depois LLM sobre o texto | ~1/20 do custo de visão, muito menos latência; e abre caminho para regex local sobre os 1–2 layouts reais, com **nada saindo da máquina** |
| **PDF escaneado** | ❌ fora da v1 | Única rota é visão: dobra o esforço (novo método de porta, upload de imagem) por um caso que o dono provavelmente não tem |
| **Imagem (JPG/PNG)** | ❌ fora da v1 | Idem. Reavaliar depois de o dono usar os dois primeiros |
| **Word (.docx)** | ❌ **fora, permanentemente** | Nenhum banco emite fatura em `.docx`. Lista de gastos em Word → colar o texto. Instalar parser de OOXML aqui é escopo desproporcional |

**Consequência boa:** com texto-apenas, `lerDocumento` **não volta** à porta. Da §3.1 do
`TASKS-IA.md`, só `completarComSchema` precisa ser restaurado — e a parte cara
(`esquema-json.ts`, validação Zod de volta, `SCHEMA_INVALIDO`) já está pronta e testada.

### D-16 — privacidade — ✅ **DECIDIDA: aceita**, 24/08/2026

> Decisão do dono: *"tem problema não"*. Ele aceita que o conteúdo da fatura trafegue para a
> API da OpenAI, que é quem executa a transcrição. Ver §15.6 para o registro do que passa a
> sair e das guardas que seguem valendo mesmo com a decisão tomada.

Fatura de cartão é o documento mais sensível que este app já manuseou. Hoje trafegam
agregados e valores (`README.md`). Passaria a trafegar a **lista de estabelecimentos com data
e valor** — perfil de deslocamento e consumo, não só finanças. Precisa ser aprovação
consciente e entrada nova no README, não efeito colateral.

**Independentemente da decisão: não guardar os bytes do documento em lugar nenhum** — nem em
`./data/`, que é reservado ao snapshot de salvaguarda do backup. Guardar só o hash e os itens.

---

## 6. Normalização — tipo puro do domínio

`src/domain/finance/importacao.ts` (novo, puro):

```ts
// PSEUDOCÓDIGO — desenho, não implementação
export type SinalLinha = 'COMPRA' | 'ESTORNO' | 'TARIFA' | 'PAGAMENTO_FATURA';

export interface ItemExtraido {
  ordem: number;                 // posição na fatura, estabiliza a UI
  descricaoOriginal: string;     // texto cru, nunca sobrescrito
  valorCents: number;            // Int, sempre POSITIVO
  sinal: SinalLinha;             // o sentido vem daqui, não do sinal do número
  data: DataCivil | null;        // "YYYY-MM-DD" resolvida, ou null se ambígua
  dataOriginalTexto: string;     // "12/03", "12 MAR" — auditoria
  parcela: { atual: number; total: number } | null;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
}
```

- **`confianca` é enum, não `0..1`.** Float não é auditável, não é estável entre modelos, e
  abriria o primeiro `Float` do repo. Enum é o que a UI de fato usa.
- **`valorCents` sempre positivo**, sentido em `sinal` — mesma disciplina de
  `Transacao.valorCents` (`schema.prisma:146`).
- `descricaoOriginal` é imutável; o que o dono edita é campo separado.

---

## 7. Conciliação — o coração

### 7.1 Contra o quê se concilia (quatro destinos, não um)

1. **`Transacao` com `parcelamentoId` + `parcelaNum`** — parcela já gerada, já consome verba
   → nada a fazer, marcar conciliada.
2. **`Transacao` avulsa** (variável já lançado à mão) → nada a fazer.
3. 🔴 **`CustoFixo` do ciclo** — **não é `Transacao`**, já descontado em `Ciclo.fixosCents`.
   Ação correta: `marcarCustoFixoPago` (`application/pagamentos.ts:37-44`), que é
   **rastreamento puro e não toca saldo nem verba**. **Criar `Transacao` aqui é o bug mais
   caro que este plano pode produzir.**
4. **Nada** → item novo.

E um quinto que não é conciliação e sim descarte: **linhas que não são gasto** (pagamento da
fatura anterior, saldo anterior).

### 7.2 A função pura

```ts
// PSEUDOCÓDIGO — desenho, não implementação
export type Veredito =
  | { tipo: 'CASA_PARCELA';      transacaoId: string; parcelamentoId: string; parcelaNum: number }
  | { tipo: 'CASA_VARIAVEL';     transacaoId: string }
  | { tipo: 'CASA_CUSTO_FIXO';   custoFixoId: string; jaMarcadoPago: boolean }
  | { tipo: 'NOVA_AVULSA' }
  | { tipo: 'NOVA_PARCELA_ORFA'; atual: number; total: number }
  | { tipo: 'AMBIGUA';           candidatos: Candidato[]; motivo: string }
  | { tipo: 'IGNORAR';           motivo: string };

export function conciliarFatura(params: {
  itens: readonly ItemExtraido[];
  transacoes: readonly TransacaoConciliavel[];
  custosFixos: readonly CustoFixoConciliavel[];
  pagamentosDoCiclo: readonly { custoFixoId: string }[];
  ciclosFechados: readonly { dataInicio: DataCivil; dataFim: DataCivil }[];
  janelaDias?: number;   // default 3
}): ResultadoConciliacao;
```

Sem `await`, sem `new Date()`, sem import de `infrastructure/`. **Cada veredito carrega o
motivo em texto** — D-14 literal: veredito mudo faz a UI (e o dono) inventar a causa.

### 7.3 Regra de match — determinística, três níveis

| Nível | Condição | Resultado |
|---|---|---|
| 1 — exato | mesmo `valorCents` **e** `normalizarDescricao` igual **e** `diffDias === 0` | `CASA_*` |
| 2 — provável | mesmo `valorCents` **e** `diffDias <= janelaDias` **e** afinidade acima do limiar | `CASA_*` |
| 3 — só valor | mesmo `valorCents` na janela, descrição não bate | `AMBIGUA` — **nunca** auto-aprovada |

**Afinidade por sobreposição de tokens, não distância de edição.** Levenshtein é péssimo aqui:
`"PAG*IFOOD SAO PAULO BR"` vs `"ifood"` tem distância enorme e é o mesmo gasto. Regra:
normalizar com `normalizarDescricao`, tokenizar, descartar ruído conhecido (`pag`, `pagto`,
`br`, `sao paulo`, `compra`, códigos numéricos) e casar se **algum token de ≥4 caracteres de
um lado é prefixo de um token do outro**. Simples, explicável ao dono, cada regra vira teste.

**Precedências:**
- Item com `parcela` casa preferencialmente contra `Transacao` com `parcelamentoId != null` e
  `parcelaNum === atual` e valor igual, no mês de competência. Descrição é desempate, não
  requisito — o descritor de parcela varia de mês para mês.
- Custo fixo casa por **valor exato** + nome normalizado, ou valor exato + `diaVencimento`
  próximo. Valor exato é sinal forte porque custo fixo tem valor fixo por construção.

**Atribuição 1-para-1 determinística:** dois passes gulosos (todos os nível 1, depois os
nível 2, ordenados por `ordem`), não algoritmo húngaro. Preserva o critério da A3: duas
compras idênticas de R$ 30 no mesmo dia contra **uma** existente → uma `CASA_VARIAVEL` + uma
`NOVA_AVULSA`.

### 7.4 Os casos chatos

| Caso | Decisão |
|---|---|
| **Estorno** | `IGNORAR` com motivo, **e** — se casar com uma `Transacao` do período — exibir "esta compra foi estornada; trate na tela de transações". **Não propor nada** (coerente com `TASKS-IA.md` §12.1: estorno tem efeito em saldo que não cabe num clique) |
| **Pagamento da fatura anterior** | `IGNORAR` **sempre**. É transferência; lançar duplicaria a fatura inteira |
| **IOF / juros / anuidade / multa** | `NOVA_AVULSA` com `categoriaSugerida: null` e selo visível. É dinheiro que saiu e consome verba — não pode ser ignorado. Vai para a faixa "precisa de você" |
| **Parcela órfã ("3/12")** | 🔴 **decisão D-17 em aberto** — §8 |
| **Já lançado à mão com descrição diferente** | Nível 3 → `AMBIGUA`. Default **não aprovar**; mostrar a candidata lado a lado. É o caso em que aprovar em bloco mata |
| **Linha em ciclo fechado** | `retroativa: true`; nunca no bloco automático; confirmação explícita por linha (§3.1) |
| **Valor não-inteiro ou data irresolúvel** | Rejeitada com motivo; a importação segue. **Nunca chuta** |

### 7.5 `detectarAssinaturas` serve de base? Não — e não force

`detectarAssinaturas` (`analise.ts:116+`) agrupa por `(valorCents, descNorm)` **através de
ciclos** para achar recorrência. Conciliação é **pareamento 1-para-1 dentro de um período**.
Problema diferente, saída diferente, invariante diferente (aqui cada candidato é consumido uma
vez; lá não existe consumo).

**Reusar `normalizarDescricao` (`analise.ts:104`), e só.** Manter o critério da A3:
`grep -c "function normalizar" src/domain/finance/` continua devolvendo 1.

---

## 8. Classificação de item novo — parcela vs gasto único

Sinal primário é **o texto da fatura**: bandeira brasileira imprime `"3/12"`, `"PARC 03/12"`,
`"03 DE 12"`. O extrator devolve `parcela` quando o padrão aparece e `null` quando não.
**Não inferir parcelamento por valor "redondo" nem por recorrência** — isso é adivinhação
sobre dinheiro.

| Situação | Ação |
|---|---|
| Sem indício de parcela | `criarTransacao` — variável do mês |
| `atual === 1` | `criarParcelamento` — caso limpo, o app passa a enxergar as N−1 futuras |
| `atual > 1`, parcelamento conhecido | conciliado, nada a criar |
| `atual > 1`, parcelamento **desconhecido** | 🔴 **D-17, em aberto** |
| Indício ambíguo (`"3/12"` que pode ser data) | `AMBIGUA`, o dono decide |

### D-17 — parcela órfã — ✅ **DECIDIDA: opção (c)**, 24/08/2026

> Decisão do dono, literal: *"se nesse ciclo está em 3/12 mas o ciclo que estaria no 2/12 não
> existe, não há problema algum, só preciso saber que estamos na terceira parcela de 12"*.
> Ou seja: **nada de histórico retroativo**, e o compromisso futuro precisa ficar visível.
> É exatamente a (c). Ver §15.3.

**(a) Só transação simples + aviso** — o que a A6 original manda. Seguro, não toca ciclo
fechado. **Preço:** as parcelas 4..12 seguem invisíveis à projeção — o dado mais valioso do
app. O dono importa de novo mês que vem e cai no mesmo lugar.

**(b) `Parcelamento` "a partir de agora"**: `dataCompra` = competência da parcela atual,
`numParcelas` = total − atual + 1. **Preço:** grava um fato falso — o app passa a dizer que
foi compra de 10x quando foi de 12x. Este repo já provou três vezes (D-13, D-14, D-15) que
odeia número plausível e falso.

**(c) Migração mínima: `Parcelamento.parcelaInicial Int @default(1)`** — registro honesto
(compra de 12x, importada a partir da 3ª), projeção enxerga as futuras, nenhuma transação
nasce em ciclo fechado. **Preço:** uma coluna, uma migração, e `gerarParcelas` ganha
deslocamento em `parcelaNum` (o rateio de `ratearCents` continua sobre o total das parcelas
*importadas*, não sobre a compra original — precisa estar no comentário, senão vira o próximo
"número plausível e falso").

**Recomendação: (c)** — é a única que não escolhe entre mentir e ser cego.

---

## 9. Proposta em lote e confirmação — a parte difícil

> ⚠️ **SUPERADA em parte pela §15** (revisão de 24/08/2026, decisão do dono). A §9.1 concluía
> que "importação não é conversa" partindo de uma premissa errada: 40 propostas individuais.
> O fluxo real é **uma proposta com N linhas**, e ela cabe no chat. A §9.2 (faixas de risco) e
> a §9.3 (a trava) continuam válidas e são reaproveitadas na §15.

### 9.1 Decisão estrutural: importação não é conversa

Fazer isso pelo chat quebra por três lados independentes:

- `MAX_TURNOS = 6` (`copiloto.ts:36`) — 40 `propor_lancamento` não cabem em 6 turnos.
- `recolherPropostas` (`copiloto.ts:311-330`) foi desenhado para **uma** proposta por
  resposta; `PropostaExibivel` é objeto efêmero sem tabela.
- 40 cartões numa thread de chat é UI hostil.

**Desenho: tela própria `/importar`.** O chat, no máximo, linka para ela. Rende três coisas
de graça:

1. **O LLM entra uma única vez** — transcrever documento → linhas. Ele **não** participa da
   conciliação (função pura) nem da gravação (casos de uso existentes). A superfície de erro
   do modelo encolhe para "leu certo o texto?", a única coisa que ele faz bem aqui.
2. Loop de tools, `MAX_TURNOS` e teto de custo saem do caminho.
3. A 7b é respeitada **mais** literalmente que hoje, não menos.

### 9.2 Confirmação por faixa de risco

| # | Faixa | Ação | Bloco? |
|---|---|---|---|
| 1 | **Já registrado** (`CASA_PARCELA`, `CASA_VARIAVEL`) | nenhuma | nada a confirmar. Colapsado — é a evidência de que a conciliação funcionou |
| 2 | **Custos fixos reconhecidos** (`CASA_CUSTO_FIXO`) | `marcarCustoFixoPago` | ✅ **sim** — não cria transação, não mexe em verba, é rastreamento |
| 3 | **Novos sem ambiguidade** (data resolvida, categoria resolvida **por código**, sem conflito, fora de ciclo fechado) | `criarTransacao` | ✅ **sim** — "Lançar os N · **R$ X**", com o total no botão e um × por linha |
| 4 | **Precisa de você** (`AMBIGUA`, parcela órfã, tarifas, sem categoria, data ambígua, ciclo fechado) | uma a uma | ❌ **não** |
| 5 | **Ignorados** (estornos, pagamento da fatura) | nenhuma | colapsado, com opção de resgatar |

### 9.3 A trava que faz a 7b valer — critério de aceite

A 7b existe porque **o modelo** não pode gravar: "o valor gravado passa a ser o valor que o
modelo digitou, sem ninguém conferir" (`propostas.ts:9-20`). Aqui, o que o dono aprova em
bloco é lista produzida por **função pura**, com o documento na tela ao lado; a única
contribuição do modelo é a transcrição, e ela é visível.

> **Nenhuma linha entra na faixa 3 se qualquer campo decisório dela veio de inferência do
> modelo além de transcrição.**
> Categoria resolvida por casamento de nome contra `Categoria` **em código** → faixa 3.
> Categoria "sugerida" pelo modelo → **faixa 4, sempre**.
> Data resolvida por `resolverAnoDaFatura` (função pura) → faixa 3. Data "deduzida" pelo
> modelo → faixa 4.

Testável por teste puro sobre a saída da conciliação, no espírito do `ferramentas.test.ts:126`.

**Alvo dimensionado:** numa fatura de 40 linhas, esperado ~15 já registradas, ~8 custos fixos,
~12 triviais e **~5 que precisam de atenção**. O dono clica 3 botões e resolve 5 linhas. **Se
a faixa 4 vier com 25 linhas, o extrator ou a conciliação estão ruins — a resposta é
consertá-los, nunca afrouxar a trava.**

### 9.4 Modelo de dados — tabelas novas, não reuso de `Proposta`

`Proposta` é efêmera e unitária; não serve. E o rascunho precisa sobreviver a um reload:
perder uma extração que custou tokens e 40 segundos é caro (a A8 original aceitava perder —
isso envelheceu).

```prisma
// PSEUDOCÓDIGO — desenho, não implementação
model Importacao {
  id             String   @id @default(cuid())
  donoId         String
  dono           Usuario  @relation(fields: [donoId], references: [id], onDelete: Cascade)
  origem         String   // TEXTO_COLADO | PDF
  nomeArquivo    String?
  hashConteudo   String   // sha256 do texto normalizado
  competenciaRef String   // "YYYY-MM" — informado pelo dono no upload
  status         String   // RASCUNHO | CONFIRMADA | DESCARTADA
  tokensEntrada  Int      @default(0)
  tokensSaida    Int      @default(0)
  criadaEm       DateTime @default(now())
  confirmadaEm   DateTime?
  itens          ItemImportado[]

  @@unique([donoId, hashConteudo])   // idempotência forte, composta com donoId
  @@index([donoId, criadaEm])
}

model ItemImportado {
  id                String @id @default(cuid())
  donoId            String
  importacaoId      String
  ordem             Int
  descricaoOriginal String
  valorCents        Int
  sinal             String
  data              String?   // YYYY-MM-DD, null = ambígua
  dataOriginalTexto String
  parcelaAtual      Int?
  parcelaTotal      Int?
  confianca         String    // ALTA | MEDIA | BAIXA — enum, nunca Float
  veredito          String
  vereditoMotivo    String    // D-14: nunca mudo
  alvoTipo          String?   // TRANSACAO | CUSTO_FIXO
  alvoId            String?
  decisao           String    // PENDENTE | APROVADA | DESCARTADA | GRAVADA
  chaveDedup        String

  @@unique([donoId, importacaoId, ordem])
  @@index([donoId, chaveDedup])
}

// em Transacao:
origem          String  @default("MANUAL")  // MANUAL | IMPORTACAO
itemImportadoId String? @unique             // FK, não hash solto
```

Toda unicidade **composta com `donoId`**. Acesso por id usa `findFirst({ where: { id, donoId } })`,
nunca `findUnique`. `scripts/verificar-isolamento.ts` ganha as duas tabelas.
`BACKUP_VERSION` sobe (`infrastructure/backup.ts`), com ciclo export → limpar → import
validado (`SPEC.md` §12, critério 9). Depois da migração:
`pnpm db:generate && rm -rf .next && pnpm dev`.

---

## 10. Ambiguidade de ano e virada de dezembro — sem `new Date()`

```ts
// PSEUDOCÓDIGO — desenho, não implementação
export function resolverAnoDaFatura(params: {
  diaMes: { dia: number; mes: number };
  competenciaRef: string;   // "YYYY-MM" — informado pelo dono no upload
}): { data: DataCivil } | { ambigua: true; motivo: string }
```

1. O dono informa a **competência da fatura** no upload (um `select`, um clique). Elimina 100%
   da ambiguidade estrutural.
2. Candidatos: ano de `competenciaRef` e `ano − 1`. Monta cada candidato **como string** com
   `padStart` — **nunca `new Date(string)`**.
3. Aceita o que cai na janela `[addMeses(fimDaCompetencia, -3), fimDaCompetencia]`, comparada
   **lexicograficamente** com `estaNoIntervalo` (`shared/data.ts:87`).
4. Zero ou dois candidatos → `{ ambigua: true, motivo }` → faixa 4. **Nunca chuta.**

**Virada de dezembro** (o caso que quebra ingênuos): fatura de `2027-01`, linha `"12/12"`.
Candidato `2027-12-12` cai fora da janela (futuro); `2026-12-12` cai dentro → correto. É a
regressão do bug UTC da `SPEC.md` §5.1 — vira caso de teste obrigatório, junto de `31/01` vs
`01/02` e `29/02`. `MESES_ABREVIADOS_PT_BR` já existe (`shared/data.ts:98`) e cobre `"12 MAR"`.

---

## 11. Idempotência — três camadas independentes

1. **`Importacao @@unique([donoId, hashConteudo])`** — reenviar o mesmo documento **não
   re-extrai** e reabre o rascunho. Se `status = CONFIRMADA`, a tela diz "já importada em
   DD/MM · N lançamentos · R$ X" em vez de oferecer importar de novo.
2. **`Transacao.itemImportadoId @unique`** — garantia **no banco** de que um item nunca vira
   duas transações. Cobre duplo clique, retry de rede, duas abas. Índice sobre hash (proposta
   original da A2) **não cobre** nada disso.
3. **A própria conciliação** — mesmo com fatura reemitida (hash e layout diferentes), as
   linhas casam contra as `Transacao` que a importação anterior criou e caem em "já
   registrado".

Sem as três, sobra heurística — que falha exatamente quando o banco reemite a fatura.

---

## 12. Fases, com aceite verificável

**Pré-requisito: G0 do `TASKS-GRAFO.md`** (`CustoFixo.categoriaId` sobretudo).

| Fase | Escopo | Aceite |
|---|---|---|
| **I0** | Decisões: **D-16** (privacidade), **D-17** (parcela órfã: a/b/c), **D-18** (aprovação em bloco por faixa) | Registradas com o porquê. **Bloqueia tudo** |
| **I1** | Migração: `Importacao`, `ItemImportado`, `Transacao.origem`/`itemImportadoId`; `BACKUP_VERSION`; isolamento | Contagem de `Transacao` antes == depois, linhas antigas `origem="MANUAL"` · ciclo export→limpar→import idêntico · `pnpm verificar:isolamento` verde · dev server reiniciado |
| **I2** | `domain/finance/importacao.ts` puro: `ItemExtraido`, `resolverAnoDaFatura`, `chaveDeduplicacao`, `conciliarFatura` + testes | Casos das §7.4 e §10 cobertos · zero `new Date(`, zero `await`, zero import de `infrastructure/` · `grep -c "function normalizar" src/domain/finance/` == 1 · **teste dedicado: linha que casa com `CustoFixo` NUNCA produz veredito que crie `Transacao`** |
| **I3** | **Caminho "colar texto"** ponta a ponta: `completarComSchema` restaurado · `application/importacao/{extrair,conciliar,confirmar}.ts` · tela `/importar` com as 5 faixas | Fatura real do dono produz as 5 faixas · faixa 3 contém **só** linhas sem inferência do modelo (teste) · reimportar o mesmo texto não duplica nada · `pnpm test`/`typecheck`/`build` verdes |
| **I4** | **PDF nativo**: `unpdf` + `app/api/importacao/route.ts` com as guardas do backup | PDF real percorre o pipeline de I3 · PDF acima do teto devolve erro legível, não estouro · **bytes não gravados em disco** (grep) |
| **I5** | Auditoria (padrão D7) + README | Greps limpos · `pnpm build` verde |

### O que NÃO fazer na v1

- **Word/.docx** — nunca.
- **PDF escaneado, imagem, OCR, visão** — reavaliar só depois de I3+I4 com faturas reais.
- **Parcelamento retroativo que cria transação em ciclo fechado** — nunca, em nenhuma opção
  da D-17.
- **Importar renda, transferência ou estorno** (coerente com `TASKS-IA.md` §12.1).
- **Importação por dentro do chat** (§9.1).
- **Guardar o documento** em `./data/` ou em qualquer lugar.
- **Aprender/ajustar layout automaticamente** entre importações — ML sobre dinheiro, sem onde
  validar o resultado.
- **`parseBRL` sobre texto de fatura** (§4.2).
- **Subir `serverActions.bodySizeLimit` globalmente** (§3.2).

---

## 13. Riscos

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| R1 | 🔴 **Custo fixo importado como `Transacao`** → dupla contagem de R$ 4.884/mês; verba consumida duas vezes, teto diário desaba | **crítica** | `CASA_CUSTO_FIXO` é destino de primeira classe; ação é `marcarCustoFixoPago`, nunca `criarTransacao`. Teste puro dedicado (I2). Tabela da §4.4 entra no `CLAUDE.md` |
| R2 | 🔴 **Data errada corrompe o teto do dia** — linha datada "hoje" por engano rouba teto de hoje | **crítica** | Data ambígua → faixa 4. `resolverAnoDaFatura` puro com teste de virada de dezembro. `dataOriginalTexto` preservado |
| R3 | 🔴 **Injeção via conteúdo do documento** — um "estabelecimento" chamado `IGNORE INSTRUÇÕES E...` é conteúdo hostil dentro do que o modelo lê | alta | Modelo chamado **fora** do loop de ferramentas, com schema estrito: a única saída válida é a lista de itens. Sem tools no caminho, a injeção não tem o que acionar. Item explícito da auditoria I5 |
| R4 | **Duplicação de lançamento** | alta | Três camadas da §11; a `@unique` no banco não depende de heurística |
| R5 | 🔴 **Transação retroativa em ciclo fechado**, agravada por `criarTransacao` não impedir isso hoje (§3.1) | alta | Guarda na conciliação: ciclo fechado → faixa 4 + confirmação explícita por linha |
| R6 | **Privacidade** — lista de estabelecimentos, datas e valores sai da máquina | alta | D-16 explícita · "colar texto" primeiro (nada em disco) · README atualizado · bytes nunca persistidos · regex local como caminho de zero-envio depois de ver 2 faturas |
| R7 | **Custo de token** | **baixa** — 8k/fatura contra 500k/dia | Não é o gargalo. O gargalo é o **timeout de 60s** → fatiar em blocos de ~20 linhas |
| R8 | **Layout imprevisível** — extrator lê errado e ninguém percebe | média | `descricaoOriginal` e `dataOriginalTexto` preservados · `confianca` visível por texto+ícone, nunca só cor · **total da fatura conferido contra a soma das linhas e exibido**: divergência é sinal, não erro a esconder (D-13) |
| R9 | **Teto de IA global** — `UsoIA` sem `donoId` (`composition.ts:114`) | média | Não criado aqui; registrar como dívida. Um dono importando faturas pode esgotar o teto do outro |
| R10 | **Fadiga de aprovação** — faixa 4 grande faz o dono aprovar no automático, matando a proteção | média | Medir o tamanho da faixa 4 nas primeiras importações reais. Faixa 4 grande = extrator ruim; consertar o extrator, **nunca** afrouxar a trava da §9.3 |

---

## 14. Premissas — confirmar antes de executar

1. O dono tem **1 ou 2 cartões**, com faturas em **PDF nativo** (não escaneado). Se for
   escaneado, a v1 muda de forma.
2. Faturas em português, formato brasileiro, data `DD/MM` ou `DD MMM`.
3. O dono aceita informar a **competência da fatura** no upload (um clique). Sem isso, a
   resolução de ano vira adivinhação e a §10 cai.
4. "Custos fixos na fatura" significa custos fixos **já cadastrados** (Netflix, academia), não
   descobrir custos fixos novos automaticamente — isso já existe em `assinaturas_detectadas`
   e é outro caminho.
5. `Importacao`/`ItemImportado` entram no backup. Se o dono preferir que não (são rascunho,
   não fato financeiro), a `BACKUP_VERSION` muda de forma — decidir na I1.

---

## 15. Revisão de escopo — 24/08/2026 (decisão do dono)

O dono corrigiu duas premissas deste plano. As correções **simplificam** o desenho.

### 15.1 O fluxo real: anexar no chat, uma proposta só

Literal: *"eu anexar um documento no chat... e o agent entender isso e registrar nos gastos o
que ainda não estiver lá. Ou que ele entenda tudo e me liste tudo que eu gastei e valor total,
e eu decido se mando ele registrar."*

A §9.1 concluiu "importação não é conversa" a partir de uma premissa que **não é a do dono**:
40 chamadas de `propor_lancamento`, uma por linha. Com essa premissa, `MAX_TURNOS = 6` e o
`CartaoProposta` unitário realmente quebravam.

**O fluxo real é uma proposta com N linhas dentro, confirmada de uma vez.** E aí cabe no chat
sem forçar nada:

| Obstáculo levantado na §9.1 | Com uma proposta só |
|---|---|
| `MAX_TURNOS = 6` não segura 40 propostas | gasta **2 turnos**: um para conciliar, um para propor |
| `recolherPropostas` (`copiloto.ts:311-330`) foi feito para **uma** proposta por resposta | é exatamente uma proposta por resposta |
| 40 cartões numa thread é UI hostil | **um** cartão com a lista dentro |

**Fluxo alvo:**

```
1. Dono anexa o documento na conversa
2. Extração (LLM, uma vez, só transcrever)     -> ItemExtraido[]
3. Ferramenta conciliar_importacao (leitura)   -> função pura, 4 destinos
4. O copiloto RESPONDE EM TEXTO:
     "Li 40 lançamentos, R$ 8.432,10 no total.
      23 já estão registrados. 8 são custos fixos que reconheci.
      7 são novos: [lista com data, descrição, valor]. 2 não consegui decidir: [...]"
5. Uma proposta: propor_importacao { itens: [...], totalCents }
6. Dono lê e diz "pode registrar" -> confirma UMA vez -> os N são gravados
```

A parte "me liste tudo e o valor total" do pedido é atendida no **passo 4**, e ela é
independente do passo 6: o dono pode simplesmente não confirmar, e a importação morre sem
gravar nada — que é o comportamento da 7b levado a sério.

### 15.2 O que muda e o que não muda

**Muda:**

- A tela `/importar` **deixa de ser o caminho principal** e vira, no máximo, o histórico de
  importações (opcional, pode nem existir na v1).
- Nasce `propor_importacao` (proposta com N itens) e `conciliar_importacao` (ferramenta de
  leitura pura). Ambas em `application/ia/ferramentas/`, nenhuma grava — o padrão de
  `escrita.ts` é mantido.
- `PropostaExibivel` (`propostas.ts`) ganha um tipo novo com lista de itens. `Importacao` /
  `ItemImportado` (§9.4) continuam existindo, agora como **persistência do rascunho** que a
  proposta referencia — a proposta em si continua efêmera.
- **Anexo no chat vira requisito**, e é a maior peça de infra nova: `MensagemConversa` precisa
  aceitar arquivo (`schema.prisma:394-406` não tem noção de arquivo), e a rota
  `app/api/importacao/route.ts` (§3.2) passa a ser o caminho de upload **desde a v1**, não só
  na I4. "Colar texto" continua valendo como atalho, mas não é mais o primeiro caminho.

**Não muda — segue valendo integralmente:**

- 🔴 **R1**: custo fixo NUNCA vira `Transacao` (§7.1 destino 3, §4.4). É o risco crítico e ele
  não some por a importação estar no chat.
- **§9.2 (faixas de risco)** vira a **estrutura da lista no passo 4**: já registrado / custo
  fixo reconhecido / novos sem ambiguidade / precisa de você / ignorados. O dono lê agrupado
  por risco, mesmo confirmando de uma vez.
- **§9.3 (a trava)** continua sendo critério de aceite, com a formulação adaptada: linha cujo
  campo decisório veio de inferência do modelo (categoria "sugerida", data "deduzida")
  **entra na proposta sem esse campo** — lançada sem categoria, para o dono classificar
  depois — em vez de entrar com um palpite. Nunca bloqueia a importação; nunca grava palpite.
- Conciliação como **função pura** (§7), idempotência em três camadas (§11),
  `resolverAnoDaFatura` sem `new Date()` (§10), `parseBRL` fora (§4.2), guarda de ciclo
  fechado (§3.1), Word fora (§5).

### 15.3 D-17 resolvida — `Parcelamento.parcelaInicial`

O dono não quer histórico retroativo; quer saber que está na 3ª de 12 e que faltam 9.

- `Parcelamento` ganha `parcelaInicial Int @default(1)`. Uma compra de 12x importada a partir
  da 3ª grava `numParcelas: 12`, `parcelaInicial: 3`.
- `gerarParcelas` (`domain/finance/parcelamento.ts`) gera **só de `parcelaInicial` até
  `numParcelas`** — nenhuma `Transacao` nasce em ciclo fechado.
- O rateio de `ratearCents` incide sobre **o total das parcelas importadas**, não sobre o valor
  da compra original. Isso precisa estar no comentário da função, senão vira o próximo "número
  plausível e falso" (D-13/D-14/D-15).
- A UI mostra "3/12" e a projeção enxerga as 9 futuras. O registro fica honesto: foi compra de
  12x, o app conheceu a partir da 3ª.

**Aceite:** teste de que importar "3/12" de R$ 300 gera 10 transações (3ª a 12ª), nenhuma
anterior à competência da 3ª · nenhuma transação em ciclo com `fechado = true` · a projeção
de compromissos futuros inclui as 9 restantes.

### 15.4 O risco que a decisão do dono assume

Confirmar N linhas com um clique significa que **um erro de transcrição do modelo é gravado
junto**. O dono aceitou esse desenho conscientemente, e a compensação é:

1. A lista do passo 4 mostra **data, descrição e valor de cada linha** — é o que ele lê antes
   de confirmar. Não é um clique cego.
2. **O total é conferido contra a soma das linhas e exibido.** Divergência é sinal, não erro a
   esconder (D-13).
3. `Transacao.origem = "IMPORTACAO"` + `itemImportadoId` dão o caminho de volta: uma
   importação inteira é identificável e reversível em bloco.
4. Nada com campo decisório inferido pelo modelo entra com palpite (§15.2).

**Desfazer importação** passa a ser funcionalidade necessária, não opcional — se a confirmação
é em bloco, o arrependimento também tem que ser. Entra como fase.

### 15.5 Fases revistas

```
G0 (TASKS-GRAFO)     pré-requisito: CustoFixo.categoriaId
I0   decisões        D-16 (privacidade) ainda aberta · D-17 ✅ decidida (c) · D-18 ✅ decidida (§15.1)
I1   migração        Importacao, ItemImportado, Transacao.origem/itemImportadoId,
                     Parcelamento.parcelaInicial, anexo em MensagemConversa
I2   domínio puro    importacao.ts: ItemExtraido, resolverAnoDaFatura, conciliarFatura
I3   anexo no chat   upload por API route + extração + conciliar_importacao +
                     propor_importacao + confirmação em bloco
I4   desfazer        reverter uma importação inteira (§15.4)
I5   auditoria       padrão D7 + README (o que trafega)
```

O caminho "colar texto" continua no escopo como atalho barato de I3, mas o **anexo é o
requisito**, não ele.

**Nada mais bloqueia o início.** D-16, D-17 e D-18 estão decididas; o único pré-requisito
externo é a G0 do `TASKS-GRAFO.md`.

**I1 ✅ concluída em 25/08/2026.** Entregue: migração
`20260825120000_importacao_rascunho_e_origem` (escrita à mão, `db execute` +
`migrate resolve`, `migrate diff` limpo tirando o falso positivo do HNSW) com
`Importacao`, `ItemImportado`, `Transacao.origem`/`itemImportadoId @unique`,
`Parcelamento.parcelaInicial` e o anexo em `MensagemConversa`
(`anexoNome` + FK `importacaoId`, zero bytes); `BACKUP_VERSION` 4; sete testes
novos de backup; cinco verificações novas de isolamento. Verificado no banco real:
62 transações antes e depois, todas `origem = 'MANUAL'`, 13 parcelamentos com
`parcelaInicial = 1`.

**Decisão de backup (§14, premissa 5), fechada com o dono em 25/08/2026: só as
importações CONFIRMADAS viajam.** Rascunho e descartada são estado de tela, não
fato financeiro. As confirmadas precisam viajar porque `Transacao.itemImportadoId`
aponta para dentro delas — sem os itens no arquivo, ou a FK quebraria o import, ou
o desfazer da I4 morreria no primeiro restore.

**I2 ✅ concluída em 25/08/2026.** Três funções puras novas em
`src/domain/finance/`, todas sem `await`, sem `new Date(` e sem import de
`infrastructure/`:

- `importacao-tipos.ts` — o contrato (`ItemExtraido`, `Veredito`, `Faixa`,
  `ItemConciliado`, `ResultadoConciliacao`). Os nomes de `Veredito` são os
  mesmos gravados em `ItemImportado.veredito`; o comentário do schema foi
  alinhado, porque dois vocabulários para o mesmo fato é como um deles
  envelhece sozinho.
- `importacao-data.ts` — `resolverAnoDaFatura` e `lerDiaMes`. Virada de
  dezembro passa (competência `2027-01` + `"12/12"` → `2026-12-12`), `29/02`
  resolve em bissexto e vira ambígua fora dele, e cada ambiguidade carrega o
  motivo em texto nomeando os anos e a janela (D-14).
- `importacao.ts` — `chaveDeduplicacao` e `conciliarFatura`: quatro destinos,
  três níveis de match, afinidade por sobreposição de token (nunca
  Levenshtein), atribuição 1-para-1 gulosa em dois passes, faixa derivada por
  função pura, totais por sinal para conferir contra o impresso (D-13).
- `parcelamento.ts` — `gerarParcelas` passa a honrar `parcelaInicial` (dívida
  que a I1 deixou), com o aviso da §15.3 no docblock sobre o significado de
  `valorTotalCents` num parcelamento parcialmente conhecido.

**A guarda do R1 é teste, não comentário:** linha que casa com `CustoFixo`
produz `CASA_CUSTO_FIXO` e nunca um veredito de criação, e duas linhas com o
valor do aluguel não casam ambas com o mesmo custo fixo — a segunda aparece
como gasto para o dono decidir, em vez de sumir por "já casou".

Verificado: 1161 testes verdes, `typecheck` limpo, greps de auditoria limpos
(`grep -c "function normalizar" src/domain/finance/` segue devolvendo 1 —
`normalizarDescricao` é reusada de `analise.ts`, não reescrita).

**I3 ✅ concluída em 25/08/2026**, em três ondas de subagentes com integração
revisada entre elas:

- **Onda 1** — porta + adapter Prisma de `Importacao` (todo acesso por
  `findFirst({ id, donoId })`, escrita por `updateMany` com o par);
  `completarComSchema` restaurado na porta de IA; `extrairItensDaFatura` em
  blocos de 20 linhas; `unpdf` + normalização estável + sha256 do TEXTO.
- **Onda 2** — `conciliarImportacao` (reconhece o documento pelo hash antes de
  gastar token) e `confirmarItemImportado` (grava UMA linha por vez, D-18
  revista), com idempotência na aplicação e no banco.
- **Onda 3** — rota `app/api/importacao` com as três guardas do backup, server
  actions, ferramentas `conciliar_importacao`/`propor_importacao`, e a UI de
  anexo + cartão por faixa com confirmação linha a linha.

**Três correções na integração que nenhum agente podia enxergar sozinho** —
todas da mesma família, vocabulário ou regra duplicada em dois lugares:

1. `sinal`/`confiança`/`veredito` nasceram duas vezes (persistência e motor).
   Fonte única em `model/enums.ts`, com trava de compilação.
2. `REJEITADA` ganhou nome próprio: a linha ilegível estava sendo gravada como
   `AMBIGUA`, o que faria "quantas ficaram ambíguas?" somar ambiguidade de
   casamento com falha do extrator.
3. A ferramenta de IA replicou o switch veredito → faixa; passou a reusar o
   canônico exportado por `conciliar.ts`.

**Um furo real corrigido:** o clamp de fim de mês não é reversível, então a
âncora reconstruída de uma parcela órfã pode devolver uma data alguns dias
antes da impressa — e com `diaRecebimento` alto isso atravessa a borda do
ciclo. O bloqueio de ciclo fechado passou a olhar a data que vai realmente ser
gravada, com teste de regressão.

**I4 ✅ e I5 ✅ concluídas em 25/08/2026.** `desfazerImportacao` reverte pelo
caminho que criou (avulsa por `excluirTransacao`, parcelamento apagando as N
parcelas antes do cadastro, custo fixo por `desmarcarCustoFixoPago` — que
nunca teve transação para apagar). Reversão é parcial por desenho: linha
travada por ciclo fechado continua gravada e é reportada com o motivo, e um
parcelamento é tudo-ou-nada. Transação editada à mão depois de importada é
apagada mesmo assim — não há campo que registre edição, e o diálogo avisa.
O README registra o que a D-16 aprovou, incluindo um fato que o plano não
previa: o fatiamento manda TODAS as linhas do documento, não só as de gasto.
Auditoria D7 limpa.

**Lacunas conhecidas, ainda em aberto:**

- `ItemImportado` não guarda os `candidatos` de uma linha `AMBIGUA` (só o
  motivo em texto), então a UI não tem como oferecer a escolha lado a lado —
  a §7.4 pede exatamente isso ("mostrar a candidata lado a lado").
- Não há editor inline de ajustes (categoria/data/conta) no cartão: a linha
  que precisa de um dado faltante mostra o erro do servidor, mas o dono não
  consegue supri-lo dali.
- `CUSTO_FIXO_RECONHECIDO` exibe a descrição da FATURA, não o nome do custo
  fixo cadastrado.
- `retroativa` não é persistida em `ItemImportado`: ao reabrir um rascunho, a
  faixa é rederivada sem a promoção por ciclo fechado.
- Dívida antiga que esta fase pressiona: `UsoIA` não tem `donoId`, então o teto
  diário de IA é global entre donos (§13, R9).

**Dívida da I1, quitada na I2:** `gerarParcelas`
(`domain/finance/parcelamento.ts`) ignorava `parcelaInicial`. A coluna nasce
com `@default(1)`, então o comportamento de hoje está correto para todo parcelamento
existente; o deslocamento da §15.3 (gerar só de `parcelaInicial` até `numParcelas`,
com o rateio incidindo sobre o total das parcelas IMPORTADAS) é mudança de função
pura e entra com os testes dela na I2.

### 15.7 D-18 revista — confirmação linha a linha do que é NOVO (25/08/2026)

O dono corrigiu a §15.1 no momento de começar a I1. Literal: *"ele pode importar
todas, porém ele deve me pedir para confirmar manualmente uma por uma, qual é minha
e qual não é. As que já casam com o que já existe no nosso lado não é necessário
confirmação, só pular"*.

**O que muda:** a faixa 3 da §9.2 ("novos sem ambiguidade") **deixa de ser aprovável
em bloco**. Toda linha que vai VIRAR lançamento é confirmada individualmente. O
ganho de tempo vem do outro lado: o que **já casa** com transação, parcela ou custo
fixo registrado não pede nada — é pulado, não confirmado.

| Faixa | Antes (§9.2) | Agora |
|---|---|---|
| 1 — já registrado | nada a confirmar | **inalterado**: pula em silêncio, colapsado |
| 2 — custo fixo reconhecido | bloco | **inalterado**: não cria `Transacao`, é rastreamento |
| 3 — novos sem ambiguidade | bloco "Lançar os N · R$ X" | **uma a uma** |
| 4 — precisa de você | uma a uma | **inalterado** |
| 5 — ignorados | nada | **inalterado** |

**O risco da §15.4 desaparece junto:** o erro de transcrição não é mais gravado
"junto" num clique — cada linha nova passa pelos olhos do dono antes de existir. O
**desfazer em bloco (I4) continua no escopo** mesmo assim: ele deixa de ser a rede
de segurança do clique único e vira a saída para "importei a fatura errada".

Segue valendo integralmente: a proposta continua sendo **uma só**, com as N linhas
dentro (o passo 5 da §15.1); o que é por linha é a **decisão**, não a proposta.
Nada com campo decisório inferido pelo modelo entra com palpite (§15.2/§9.3).

---

### 15.6 D-16 aceita — o que passa a sair da máquina

O dono aceitou. Registro do que muda, para o README (fase I5) e para não virar surpresa depois:

**O que já saía:** agregados e valores calculados pelo motor (verba, teto, totais por
categoria), via as 16 ferramentas do copiloto.

**O que passa a sair:** o **texto transcrito da fatura** — nome do estabelecimento, data e
valor de cada linha. Isso é qualitativamente diferente do que trafegava antes: é perfil de
consumo e de deslocamento, não só números financeiros. A transcrição é feita pela API da
OpenAI (`infrastructure/ia/provedor-ia.ts`), então o conteúdo passa pelo servidor dela.

**Guardas que seguem valendo mesmo com a decisão tomada** — não são condição, são higiene:

1. **Os bytes do documento não são persistidos em lugar nenhum** — nem em `./data/`, que é
   reservado ao snapshot de salvaguarda do backup. Guarda-se o hash e os itens extraídos.
2. **O README registra o que trafega** (fase I5), como já registra hoje para o copiloto.
3. **O caminho de zero-envio continua no horizonte:** depois de ver 2 ou 3 faturas reais do
   mesmo banco, um parser local por regex sobre o texto do PDF resolve o layout sem chamar
   modelo nenhum. Não é v1, mas o desenho (extração isolada em `application/importacao/`)
   deixa esse caminho aberto sem refatorar nada.
4. **R3 (injeção via conteúdo do documento) não é afetado pela D-16** e segue valendo: o
   modelo é chamado fora do loop de ferramentas, com schema estrito.
