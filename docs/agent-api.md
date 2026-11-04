# API do Agente (v1)

API REST em `app/api/agent/v1/**`, construída sobre o kernel `src/agent-api/`,
para um agente de IA **externo** (fora do copiloto embutido) operar o mesmo
motor de finanças pessoais da tela Hoje. O documento OpenAPI 3.0.3 completo
(gerado a partir do mesmo código que valida cada rota) está em
`GET /api/agent/v1/openapi.json`.

## 1. Visão geral e princípios

- **Não é uma superfície paralela.** Toda rota chama os mesmos casos de uso
  e read-models de `src/application/**` que a UI usa — `GET /contexto` usa
  `obterContextoAgente`, `GET /ciclos/atual/previa-fechamento` usa o mesmo
  `obterResumoParaFechar` do wizard de fechamento, etc. Nenhuma regra de
  negócio é redigitada aqui.
- **`donoId` vem do token, nunca do corpo ou da query.** `Authorization:
  Bearer <token>` resolve o dono na autenticação (`src/agent-api/autenticacao.ts`)
  e todo repositório é construído já escopado para ele
  (`criarDepsAgente(donoId, db)`). Não existe parâmetro `donoId` em nenhuma rota.
- **Dinheiro é sempre um inteiro em centavos**, em todo campo terminado em
  `Cents`. A resposta de **toda** rota passa por `comFmt`
  (`src/agent-api/formatacao.ts`), que acrescenta automaticamente, ao lado de
  cada `<algo>Cents`, o par `<algo>Fmt` já formatado em BRL — recursivo em
  objetos e arrays. Ex.: `"valorCents": 15000` chega com `"valorFmt": "R$
  150,00"` ao lado, sem o handler precisar formatar nada.
- **Data civil é sempre string `"YYYY-MM-DD"`**, nunca datetime, em todo campo
  que representa um dia (`data`, `dataInicio`, `dataCompra`...). Datetime
  completo (`createdAt`-like) só aparece em `/auditoria` (`criadoEm`, ISO).
- **A verba do ciclo em curso é CONGELADA.** Editar `Config`/custos
  fixos/provisões só vale a partir do **próximo** ciclo — exceto quando a
  resposta de escrita trouxer `efeitoNoCicloAtual.recalculou: true` (o ciclo
  atual ainda não tinha lançamento e foi recongelado automaticamente).
  Recongelar manualmente é `POST /ciclos/atual/recalcular` (escopo `admin`).
- **Custo fixo NUNCA cria `Transacao`.** É rastreado por `PagamentoFixo`
  (`POST/DELETE /custos-fixos/{id}/pagar`), puro rastreamento — já descontado
  da verba quando o ciclo nasceu (`Ciclo.fixosCents`, congelado). Criar uma
  `Transacao` para um custo fixo pago duplicaria o valor.
- **Parcela NÃO é deduzida da verba.** Cada parcela é uma `Transacao` de grupo
  `VARIAVEL` normal e consome o teto diário como qualquer gasto — o que "sobra
  de verdade" é `verbaLivreCents = verbaVariavelCents − parcelasComprometidasCents`,
  um campo **separado**, nunca embutido na verba.

## 2. Primeiro token

Tokens são criados na tela `/config/tokens` do app (acesso **só OWNER**). O
valor completo (`mfa_...`) aparece **uma única vez**, no momento da criação —
depois disso só o hash é guardado, então ele não pode ser recuperado, só
revogado e recriado. Guarde-o num cofre de segredos do agente assim que
aparecer.

## 3. Autenticação e escopos

Toda requisição leva `Authorization: Bearer mfa_...`. Escopos são
**aditivos** — `admin` ⊇ `write` ⊇ `read` (`src/domain/auth/api-token.ts`,
`escopoSatisfaz`): um token `write` também satisfaz qualquer rota que exija
`read`; um token `admin` satisfaz tudo.

| Escopo | O que libera |
|---|---|
| `read` | Toda leitura: contexto, transações, ciclos, análises, projeção, simulações, auditoria. |
| `write` | Tudo de `read` + criar/editar/excluir transações, parcelamentos, categorias, contas, custos fixos, provisões, patrimônio, importação de fatura. |
| `admin` | Tudo de `write` + `PATCH /config`, `POST /ciclos/atual/fechar`, `POST /ciclos/atual/recalcular` — ações que mexem no motor de verba/ciclo em si. |

Faltando o escopo exigido: `403 ESCOPO_INSUFICIENTE`. Token ausente,
malformado, desconhecido, revogado ou expirado: `401 NAO_AUTENTICADO`.

## 4. Rate limit

120 requisições/minuto por token (`src/agent-api/limite-taxa.ts`). Acima
disso: `429 LIMITE_DE_TAXA` com header `Retry-After: 60`.

## 5. Formato de erro e códigos

Todo erro tem o mesmo envelope:

```json
{ "error": { "code": "NAO_ENCONTRADO", "message": "Transação não encontrada.", "details": null } }
```

| Código | HTTP | Quando |
|---|---|---|
| `NAO_AUTENTICADO` | 401 | Header ausente/malformado; token inválido, revogado ou expirado. |
| `ESCOPO_INSUFICIENTE` | 403 | Token válido, mas sem o escopo exigido pela rota. |
| `ACESSO_NEGADO` | 403 | Regra de autorização de domínio recusou a ação (ex.: ação só-OWNER). |
| `VALIDATION_ERROR` | 400 | Corpo/query não passou no schema zod da rota — `details` traz os `issues` do zod. |
| `JSON_INVALIDO` | 400 | Corpo da requisição não é JSON válido. |
| `NAO_ENCONTRADO` | 404 | O recurso do `{id}` não existe (ou não pertence a este dono). |
| `CONFLITO` | 409 | Violação de unicidade (ex.: nome duplicado onde há constraint única). |
| `CONFIRMACAO_NECESSARIA` | 409 | Edição retroativa sem `confirmarRetroativo: true` — `details.ciclosAfetados` lista os ciclos impactados. |
| `REGRA_DE_NEGOCIO` | 422 | Regra de domínio recusou a operação (mensagem em português, pronta pro agente mostrar ao dono). |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Mesma `Idempotency-Key` reenviada com corpo diferente. |
| `PDF_BASE64_INVALIDO` | 400 | `POST /importacao`: `pdfBase64` não decodifica como base64, ou decodifica vazio. |
| `ARQUIVO_GRANDE_DEMAIS` | 413 | `POST /importacao`: PDF decodificado excede o tamanho máximo permitido. |
| `PDF_INVALIDO` | 422 | `POST /importacao`: PDF sem texto extraível, corrompido, ou excede o limite de páginas. |
| `LIMITE_DE_TAXA` | 429 | Mais de 120 req/min para este token — ver header `Retry-After`. |
| `ERRO_INTERNO` | 500 | Falha de infraestrutura (banco, etc.) — nunca vaza detalhe interno. |

## 6. `dryRun`

Toda rota de escrita aceita `?dryRun=true`. A escrita roda de verdade dentro
de uma transação e é **revertida** ao final — a resposta mostra exatamente o
que teria sido gravado, incluindo `impactoCiclo`, mas nada persiste. A
auditoria registra a tentativa mesmo assim, com `dryRun: true` (visível em
`GET /auditoria`), para o dono conseguir ver o que o agente simulou.

## 7. `impactoCiclo`

Toda resposta de escrita (real ou `dryRun`) anexa:

```json
{
  "impactoCiclo": {
    "verbaLivreAntesCents": 120000, "verbaLivreDepoisCents": 105000,
    "ritmoDiarioAntesCents": 8000, "ritmoDiarioDepoisCents": 7200
  },
  "impactoCicloMotivo": null
}
```

usando os mesmos read-models da tela Hoje (`verbaLivreCents` da projeção,
`tetoHojeCents` do estado de hoje). Quando não há ciclo aberto para comparar,
vem `"impactoCiclo": null` e `impactoCicloMotivo` explica por quê — nunca um
número fantasma.

## 8. Idempotência

Header `Idempotency-Key` (qualquer string sua) em qualquer escrita. TTL 24h.
Reenviar a **mesma chave com o mesmo corpo** devolve a resposta original, sem
repetir a escrita, com `Idempotent-Replayed: true`. Reenviar a mesma chave com
corpo **diferente** é `422 IDEMPOTENCY_KEY_REUSED`. Não tem efeito em
`dryRun` (nada é persistido, então não há "mesmo efeito" a reaproveitar).

## 9. Confirmação retroativa

Editar, excluir ou estornar uma transação (ou editar/encerrar um
parcelamento) que toca um ciclo **fechado** — ou move uma transação para
dentro/fora de um — devolve `409 CONFIRMACAO_NECESSARIA` com
`details.ciclosAfetados`. Reenvie com `confirmarRetroativo: true` no corpo
para confirmar. **Criar** uma transação com data dentro de um ciclo fechado
**não** pede confirmação (lacuna conhecida, seção 12).

## 10. Fluxo recomendado para o agente

1. `GET /contexto` primeiro — config, ciclo atual, contas, categorias, custos
   fixos, parcelamentos, provisões e último snapshot, tudo de uma vez.
2. Antes de uma escrita grande ou arriscada (parcelamento, fechamento de
   ciclo, edição de Config), chame a mesma rota com `?dryRun=true` e leia
   `impactoCiclo` antes de confirmar de verdade.
3. Em toda escrita que não seja trivial, mande `Idempotency-Key` — uma rede
   instável nunca deve duplicar um gasto.
4. Depois de qualquer escrita, olhe `impactoCiclo` na própria resposta antes
   de decidir o próximo passo — não precisa um `GET /contexto` extra só para
   saber se a verba livre caiu.

## 11. Endpoints

### Sistema

**`GET /ping`** — `read`. Smoke test de autenticação.

```bash
curl -s https://app/api/agent/v1/ping -H "Authorization: Bearer mfa_..."
```
```json
{ "ok": true, "donoId": "clx...", "tokenId": "clx...", "escopos": ["read"], "hoje": "2026-11-04" }
```

**`GET /openapi.json`** — `read`. Este documento, em OpenAPI 3.0.3.

### Contexto, ciclos, análises, projeção e simulações

**`GET /contexto`** — `read`.
```bash
curl -s .../contexto -H "Authorization: Bearer mfa_..."
```
```json
{
  "hoje": "2026-11-04",
  "config": { "rendaBaseCents": 3000000, "rendaBaseFmt": "R$ 30.000,00", "diaRecebimento": 1,
    "metaPoupancaCents": 1800000, "metaPoupancaFmt": "R$ 18.000,00", "metaPoupancaPercent": null,
    "destinoSobra": "RESERVA", "pisoDiarioVerbaCents": 5000, "pisoDiarioVerbaFmt": "R$ 50,00" },
  "ciclo": { "id": "ciclo_1", "dataInicio": "2026-11-01", "dataFim": "2026-11-30",
    "verbaLivreCents": 105000, "verbaLivreFmt": "R$ 1.050,00" },
  "cicloMotivo": null,
  "contas": [{ "id": "conta_1", "nome": "Carteira", "tipo": "VARIAVEL", "saldoCents": 50000, "saldoFmt": "R$ 500,00", "arquivada": false }],
  "categorias": [{ "id": "cat_1", "nome": "Mercado", "grupo": "VARIAVEL", "essencial": true }],
  "custosFixos": [{ "id": "cf_1", "nome": "Aluguel", "valorCents": 250000, "valorFmt": "R$ 2.500,00", "diaVencimento": 5, "pago": false }],
  "parcelamentos": [], "provisoes": [], "ultimoSnapshot": null
}
```

**`GET /ciclos`** — `read`. Query `limite` (padrão 50, teto 200). Ciclo em
curso (se houver) + os últimos `limite` fechados.
```bash
curl -s ".../ciclos?limite=5" -H "Authorization: Bearer mfa_..."
```
```json
{ "ciclos": [{ "id": "ciclo_1", "dataInicio": "2026-11-01", "dataFim": "2026-11-30", "fechado": false,
  "rendaPrevistaCents": 3000000, "rendaRealizadaCents": null, "fixosCents": 488400,
  "provisaoMensalCents": 120000, "poupancaAlvoCents": 1800000, "verbaVariavelCents": 391600,
  "rolloverRecebidoCents": 0, "sobraCents": null }] }
```

**`GET /ciclos/{id}`** — `read`. Mesmo formato de `ResumoCicloAgente` +
`gastoRealizadoCents` e `porCategoria`.
```bash
curl -s .../ciclos/ciclo_1 -H "Authorization: Bearer mfa_..."
```

**`GET /ciclos/comparar?ids=ciclo_1,ciclo_2`** ou `?ultimos=3` — `read`.
```json
{ "ciclos": [{ "id": "ciclo_1", "...": "...", "gastoRealizadoCents": 310000, "porCategoria": [] }] }
```

**`GET /ciclos/atual/previa-fechamento`** — `read`. Mesmo `obterResumoParaFechar`
do wizard: sobra, transações sem categoria, sugestão de meta, `destinoSobra`.

**`POST /ciclos/atual/fechar`** — `admin`, escrita.
```bash
curl -s -X POST ".../ciclos/atual/fechar?dryRun=true" \
  -H "Authorization: Bearer mfa_..." -H "Idempotency-Key: fechamento-nov-2026" \
  -H "Content-Type: application/json" \
  -d '{"rendaRealizadaCents": 3000000}'
```
```json
{
  "dryRun": true,
  "ciclo": { "id": "ciclo_1", "fechado": true, "sobraCents": 42000, "sobraFmt": "R$ 420,00" },
  "sobraCents": 42000, "sobraFmt": "R$ 420,00",
  "destinoSobra": "Foi para a conta Reserva.",
  "impactoCiclo": { "verbaLivreAntesCents": 105000, "verbaLivreDepoisCents": 0,
    "ritmoDiarioAntesCents": 3500, "ritmoDiarioDepoisCents": 0 },
  "impactoCicloMotivo": null
}
```

**`POST /ciclos/atual/recalcular`** — `admin`, escrita, sem corpo.
```json
{ "ciclo": { "id": "ciclo_1", "verbaVariavelCents": 391600 }, "verbaVariavelAntesCents": 380000 }
```

**`GET /gastos-por-categoria?cicloId=ciclo_1`** (ou `?de=...&ate=...`) — `read`.
```json
{ "periodo": { "cicloId": "ciclo_1", "dataInicio": "2026-11-01", "dataFim": "2026-11-30" },
  "categorias": [{ "categoriaId": "cat_1", "categoriaNome": "Mercado", "totalCents": 85000, "totalFmt": "R$ 850,00" }] }
```

**`GET /tendencias?categoriaId=cat_1&ultimos=6`** — `read`.
```json
{ "categoriaId": "cat_1", "categoriaNome": "Mercado",
  "pontos": [{ "cicloId": "ciclo_0", "dataInicio": "2026-10-01", "dataFim": "2026-10-31", "totalCents": 70000, "totalFmt": "R$ 700,00" }] }
```

**`GET /assinaturas?numCiclos=3`** — `read`.
```json
{ "ciclosConsiderados": 3, "assinaturas": [{ "descricao": "Spotify", "valorCents": 2190, "valorFmt": "R$ 21,90", "ocorrencias": 3 }] }
```

**`GET /analise-corte?numCiclos=3`** — `read`. Mesmo `obterAnalise`, com `ranking`.
```json
{ "ciclosConsiderados": 3, "ranking": [{ "categoriaId": "cat_1", "categoriaNome": "Mercado",
  "custoAnualizadoCents": 1020000, "tendencia": "ALTA", "essencial": true }], "assinaturas": [] }
```

**`GET /para-onde-vai-a-renda?limite=10`** — `read`. Decomposição em blocos do
ciclo em curso.

**`GET /projecao?ciclos=6`** — `read`. Teto 60.
```json
{ "ciclos": [{ "inicio": "2026-11-01", "fim": "2026-11-30", "diasTotais": 30,
  "rendaPrevistaCents": 3000000, "verbaVariavelCents": 391600, "parcelasComprometidasCents": 439388,
  "verbaLivreCents": -47788, "obrigacoesDoCiclo": [] }],
  "cenario": null,
  "premissas": ["Sobra zero nos ciclos futuros...", "Renda prevista constante..."],
  "cicloAtualCongelado": true }
```

**`POST /simular/compra-parcelada`** — `read` (não escreve nada, mesmo sendo
`POST` — pré-mortem). Sem `dryRun`/`Idempotency-Key`.
```bash
curl -s -X POST .../simular/compra-parcelada -H "Authorization: Bearer mfa_..." \
  -H "Content-Type: application/json" \
  -d '{"descricao":"Notebook","valorTotalCents":600000,"numParcelas":12}'
```
```json
{ "comCompra": { "ciclos": [{ "verbaLivreCents": -8400 }] }, "semCompra": { "ciclos": [{ "verbaLivreCents": 41600 }] },
  "delta": [{ "inicio": "2026-11-01", "deltaVerbaLivreCents": -50000, "deltaVerbaLivreFmt": "-R$ 500,00" }] }
```

**`POST /simular/meta-prazo`** — `read`.
```json
{ "porCicloCents": 60000, "porCicloFmt": "R$ 600,00", "numCiclos": 10 }
```

**`POST /simular/renda`** — `read`. Nunca altera o ciclo em curso congelado.

### Transações

**`GET /transacoes`** — `read`. Filtros, ordenação, paginação por cursor.
```bash
curl -s ".../transacoes?tipo=DESPESA&de=2026-11-01&ate=2026-11-30&limite=20" -H "Authorization: Bearer mfa_..."
```
```json
{ "transacoes": [{ "id": "tx_1", "valorCents": 8500, "valorFmt": "R$ 85,00", "tipo": "DESPESA",
  "data": "2026-11-03", "categoriaId": "cat_1", "metodo": "PIX" }], "proximoCursor": null }
```

**`GET /transacoes/{id}`** — `read`. `{ "transacao": {...} }`.

**`POST /transacoes`** — `write`, escrita, status 201.
```bash
curl -s -X POST .../transacoes -H "Authorization: Bearer mfa_..." \
  -H "Idempotency-Key: gasto-mercado-2026-11-03" -H "Content-Type: application/json" \
  -d '{"valorCents":8500,"tipo":"DESPESA","categoriaId":"cat_1","data":"2026-11-03","metodo":"PIX"}'
```
```json
{ "transacao": { "id": "tx_1", "valorCents": 8500, "valorFmt": "R$ 85,00", "tipo": "DESPESA", "data": "2026-11-03" },
  "impactoCiclo": { "verbaLivreAntesCents": 105000, "verbaLivreDepoisCents": 96500,
    "ritmoDiarioAntesCents": 3500, "ritmoDiarioDepoisCents": 3217 }, "impactoCicloMotivo": null }
```

**`PATCH /transacoes/{id}`** — `write`, escrita. Mesmo body de criação +
`confirmarRetroativo` se tocar ciclo fechado.

**`DELETE /transacoes/{id}`** — `write`, escrita. Corpo `{}` ou
`{"confirmarRetroativo": true}`. Resposta: `{ "excluida": true, "impactoCiclo": {...} }`.

**`POST /transacoes/{id}/estornar`** — `write`, escrita, status 201.
```bash
curl -s -X POST .../transacoes/tx_1/estornar -H "Authorization: Bearer mfa_..." \
  -H "Content-Type: application/json" -d '{}'
```
```json
{ "estorno": { "id": "tx_2", "tipo": "ESTORNO", "valorCents": 8500, "valorFmt": "R$ 85,00" }, "impactoCiclo": {...} }
```

**`POST /transacoes/lote`** — `write`, escrita, status 201. Até 100 itens,
tudo ou nada.
```bash
curl -s -X POST .../transacoes/lote -H "Authorization: Bearer mfa_..." \
  -H "Content-Type: application/json" \
  -d '{"transacoes":[{"valorCents":1200,"tipo":"DESPESA","categoriaId":"cat_1"}]}'
```
Falha de um item devolve `422 REGRA_DE_NEGOCIO` (ou `404 NAO_ENCONTRADO`) com
`details.indice` do item que quebrou — o lote inteiro é revertido.

### Parcelamentos

**`GET /parcelamentos`** / **`GET /parcelamentos/{id}`** — `read`.
`{ "parcelamentos": [...] }` / `{ "parcelamento": {...} }`, com números agregados.

**`POST /parcelamentos`** — `write`, escrita, status 201.
```bash
curl -s -X POST .../parcelamentos -H "Authorization: Bearer mfa_..." -H "Content-Type: application/json" \
  -d '{"descricao":"Notebook","valorTotalCents":600000,"numParcelas":12}'
```
```json
{ "parcelamentoId": "parc_1", "parcelas": [{ "id": "tx_10", "valorCents": 50000, "valorFmt": "R$ 500,00", "parcelaNum": 1 }], "impactoCiclo": {...} }
```

**`PATCH /parcelamentos/{id}`** — `write`, escrita. `valorTotalCents`/
`numParcelas`/`dataCompra` só aceitos sem parcela paga nem em ciclo fechado.

**`DELETE /parcelamentos/{id}`** — `write`, escrita. **Encerra**, não exclui
(seção 12). `{ "resultado": {...} }`.

**`GET /parcelamentos/{id}/previa-encerramento`** — `read`. `{ "previa": {...} }`.

**`POST` / `DELETE /parcelamentos/{id}/parcelas/{transacaoId}/pagar`** —
`write`, escrita. Rastreamento puro — não afeta verba. `{ "parcela": {...} }`.

### Categorias

**`GET /categorias`** — `read`. `{ "categorias": [...] }`.

**`POST /categorias`** — `write`, escrita, status 201.
```bash
curl -s -X POST .../categorias -H "Authorization: Bearer mfa_..." -H "Content-Type: application/json" \
  -d '{"nome":"Streaming","grupo":"VARIAVEL","essencial":false}'
```

**`PATCH /categorias/{id}`** — `write`, escrita. Único caminho de escrita —
não há exclusão (seção 12).

### Contas

**`GET /contas?incluirArquivadas=false`** — `read`. `{ "contas": [...] }`.

**`POST /contas`** — `write`, escrita, status 201.

**`PATCH /contas/{id}`** — `write`, escrita. `arquivada: true` é o caminho de
"excluir" (não há DELETE).

### Custos fixos

**`GET /custos-fixos`** — `read`.
```json
{ "custosFixos": [{ "id": "cf_1", "nome": "Aluguel", "valorCents": 250000, "valorFmt": "R$ 2.500,00",
  "ciclosComPagamento": 3, "categoriaNome": "Moradia", "pago": false }],
  "previaRecalculoCicloAtual": null }
```

**`POST /custos-fixos`** — `write`, escrita, status 201.
```json
{ "custoFixo": { "id": "cf_2", "nome": "Internet", "valorCents": 15000 }, "efeitoNoCicloAtual": { "recalculou": false }, "impactoCiclo": {...} }
```

**`PATCH /custos-fixos/{id}`** — `write`, escrita. `ativo: false/true`
desativa/reativa.

**`DELETE /custos-fixos/{id}`** — `write`, escrita. `422` se já há
`PagamentoFixo` registrado em algum ciclo.

**`POST /custos-fixos/{id}/pagar`** — `write`, escrita, status 201. Sempre o
ciclo em curso, sem corpo. `{ "ok": true }`.

**`DELETE /custos-fixos/{id}/pagar?cicloId=...`** — `write`, escrita.
`cicloId` é aceito mas **ignorado** (seção 12). `{ "ok": true }`.

### Provisões

**`GET /provisoes`** — `read`. **`POST /provisoes`** — `write`, escrita, 201.
**`PATCH /provisoes/{id}`** — `write`, escrita (`ativo` desativa/reativa).
**`DELETE /provisoes/{id}`** — `write`, escrita; `422` com `acumuladoCents != 0`
ou gasto já lançado contra ela.

### Config

**`GET /config`** — `read`. `{ config, contas, custosFixos, provisoes, categorias, fixosTotalCents, provisaoMensalCents, sugestaoRendaVariavelCents, sugestaoMetaPoupancaCents, avisoMetaIrreal }`.

**`PATCH /config`** — `admin`, escrita. Fusão parcial.
```bash
curl -s -X PATCH .../config -H "Authorization: Bearer mfa_..." -H "Content-Type: application/json" \
  -d '{"metaPoupancaPercent": 25}'
```
```json
{ "config": { "rendaBaseCents": 3000000, "metaPoupancaPercent": 25 },
  "efeitoNoCicloAtual": { "recalculou": false }, "impactoCiclo": {...} }
```

### Patrimônio

**`GET /patrimonio`** — `read`. `{ snapshots, curva, totalAtualCents, variacaoMensalCents, mesesDeReserva, motivoMesesDesconhecido, divergencias, ... }`.

**`POST /patrimonio/snapshots`** — `write`, escrita, status 201.
```bash
curl -s -X POST .../patrimonio/snapshots -H "Authorization: Bearer mfa_..." -H "Content-Type: application/json" \
  -d '{"data":"2026-11-01","itens":[{"nome":"Reserva","classe":"CONTA","valorCents":5000000}]}'
```

**`POST /patrimonio/itens/{id}/aceitar-realidade`** — `write`, escrita. Move
`Conta.saldoCents` SEM criar `Transacao` (D-13). `{ "item": {...}, "conta": {...} }`.

### Importação

**`POST /importacao`** — `write`, escrita, status 201. `{texto, competenciaRef}`
ou `{pdfBase64, competenciaRef}`.
```bash
curl -s -X POST .../importacao -H "Authorization: Bearer mfa_..." -H "Content-Type: application/json" \
  -d '{"texto":"03/11 MERCADO 85,00","competenciaRef":"2026-11"}'
```
```json
{ "importacao": { "importacaoId": "imp_1", "itens": [{ "itemId": "item_1", "veredito": "NOVO", "valorCents": 8500 }] } }
```

**`GET /importacao/{id}`** — `read`. `{ "importacao": { cabeçalho + itens } }`.

**`POST /importacao/{id}/aprovar`** — `write`, escrita. `{itens, descartar, finalizar}`.
```json
{ "resultados": [{ "itemId": "item_1", "resultado": {...} }], "descartados": [], "finalizacao": null }
```

**`POST /importacao/{id}/desfazer`** — `write`, escrita. `{ "resultado": {...} }`.

### Auditoria

**`GET /auditoria`** — `read`. Filtros `de`, `ate` (datetime ISO), `entidade`,
`acao`, `tokenId`, `dryRun`, paginação por cursor.
```json
{ "auditoria": [{ "id": "aud_1", "entidade": "Transacao", "acao": "CREATE", "dryRun": false,
  "criadoEm": "2026-11-04T12:00:00.000Z" }], "proximoCursor": null }
```

## 12. Lacunas conhecidas

- `DELETE /parcelamentos/{id}` **encerra** (cancela parcelas futuras não
  pagas), não apaga — parcelas já pagas e as de ciclo fechado são preservadas.
- Categoria não tem exclusão, só `PATCH` (o modelo não tem flag de
  arquivamento/ativo).
- `custos-fixos/{id}/pagar` (marcar e desmarcar) só atuam no **ciclo atual**;
  o `cicloId` aceito na query do `DELETE` é ignorado.
- `GET /ciclos` é uma janela recente (`limite`, teto 200) sem cursor — não
  pagina o histórico inteiro.
- `POST /simular/compra-parcelada` também devolve campos extras com valor já
  formatado fora do padrão `*Fmt` do kernel (o delta por ciclo expõe o sinal
  em texto) — confira a resposta real da rota antes de parsear por nome fixo.
- Criar uma transação com data dentro de um ciclo **fechado** não pede
  `confirmarRetroativo` — só editar, excluir e estornar pedem.
