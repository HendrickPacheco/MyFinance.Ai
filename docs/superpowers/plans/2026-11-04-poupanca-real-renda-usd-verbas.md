# Poupança real, renda em USD e verbas separadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir a poupança REAL de cada ciclo (patrimônio final − inicial) contra a meta, aceitar renda em USD com cotação PTAX e imposto, e dividir a verba em "dia a dia" e "extras" — sem mexer em `verbaVariavelCents`.

**Architecture:** Toda regra nova nasce como função pura em `src/domain/finance/` (câmbio, verbas, poupança real) com teste Vitest primeiro. Casos de uso em `src/application/` orquestram repositórios (escopados por `donoId`, exceto `Cotacao`, que é global por D4) e o serviço PTAX entra como porta com `fetch` injetado. As telas só recebem read-models prontos; o copiloto só lê.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6 + PostgreSQL 16, Vitest, zod, date-fns.

**Spec:** `docs/superpowers/specs/2026-11-04-poupanca-real-renda-usd-verbas.md` (a seção **Decisões D1–D10** sobrepõe o pedido original). Leia também `CLAUDE.md` (raiz) e `SPEC.md` §5 e §13.

## Global Constraints

- **Dinheiro é sempre `Int` em centavos**; todo campo/variável monetária termina em `Cents`. Formatação/parsing só em `src/shared/dinheiro.ts`. Câmbio é `Int taxaMicros` (taxa × 1.000.000) — nunca `Float`/`Decimal` para dinheiro ou taxa (D4). Único float tolerado: percentuais (`impostoEstimadoPercentual`, como `metaPoupancaPercent` já é) e o número que o JSON do BCB devolve, convertido para micros na fronteira do adapter.
- **Data civil é `String` "YYYY-MM-DD"**; comparação lexicográfica; aritmética só via `src/shared/data.ts`; "hoje" só via `deps.relogio.hoje()`. Nunca `new Date("YYYY-MM-DD")`.
- **Regra de cálculo só em `src/domain/finance/`**, funções puras, sem I/O. Componentes e server actions só orquestram.
- **Multi-tenant:** todo dado financeiro tem `donoId`; escopo aplicado só em `src/composition.ts`. Em `prisma-repositories.ts` nunca `findUnique({ where: { id } })` → `findFirst({ where: { id, donoId } })`; escrita por id via `updateMany`/`deleteMany` com `{ id, donoId }`. **Exceção deliberada (D4):** `Cotacao` é dado público PTAX, tabela GLOBAL sem `donoId`, unique `(data, moedaOrigem, moedaDestino)`.
- **D1:** `verbaVariavelCents` NÃO muda (`renda − fixos − provisão (+ rollover)`). Split é derivado:
  `gastavelCents = verbaVariavel − poupancaAlvo`; `diaADiaCents = min(piso × diasDoCiclo, max(gastavel, 0))`; `extrasCents = gastavel − diaADia` (pode ser negativo). Transações de tipoVerba efetivo EXTRA (inclui TODA parcela) consomem extras; o excedente reduz o dia a dia. DIA_A_DIA consome dia a dia. "Posso gastar hoje" do dia a dia = restante ÷ dias restantes, reaproveitando `calcularTeto`.
- **D2:** piso = `Config.pisoDiarioVerbaCents` existente (dono: 15000 = R$ 150). Sem campo novo.
- **D3 / D-16:** a meta é OBJETIVO, não dedução. Nenhuma tela a chama de "reservada" nem a lista com "−" ao lado de fixos/provisão. Progresso = real/meta.
- **D4:** `Cotacao` global, `taxaMicros Int`, fonte `PTAX_BCB | MANUAL`.
- **D5:** tolerância de snapshot = constante de domínio `TOLERANCIA_SNAPSHOT_DIAS = 5` com comentário `ponytail:` (vira campo de Config se o dono pedir).
- **D6:** API do agente (`src/agent-api`) fora de escopo. Copiloto = só `src/application/ia/ferramentas/*`.
- **D7:** não há bug de congelamento; entregar "Recalcular renda deste ciclo" com prévia.
- **D8:** renda real confirmada é ação explícita do dono; recalcula a verba congelada; o ciclo guarda prevista E real.
- **D9:** gates = `pnpm test`, `pnpm typecheck`, `pnpm build` (build só com dev server parado: `lsof -ti:3000` vazio). Sem script `lint`.
- **D10:** testes nunca chamam o BCB; o serviço de câmbio recebe `fetch` injetado.
- **D-11:** parcela NÃO é deduzida da verba; é `Transacao` VARIAVEL que consome teto. No split ela consome EXTRAS.
- **D-14 / D-15 (copiloto):** todo `null` sai com motivo em texto; todo número derivado sai com suas partes e a fórmula em texto.
- **Migrações à mão** (P3006 impede `migrate dev`): escrever `migration.sql` → `pnpm prisma db execute --file <sql> --schema prisma/schema.prisma` → `pnpm prisma migrate resolve --applied <nome>` → conferir com `pnpm prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` (só o falso positivo `DROP INDEX "Memoria_embedding_hnsw_idx"` é aceitável — NÃO o inclua no SQL) → `pnpm db:generate`. Dev server rodando? Reinicie (`pnpm db:generate && rm -rf .next && pnpm dev`).
- **Banco compartilhado:** `.env` desta worktree aponta o MESMO `financial_dev` do checkout principal. A migração é só aditiva (colunas com default/nullable + tabela nova), então o app em `main` continua funcionando — mas não rode nada destrutivo.
- **Dados reais do dono para testes:** renda R$ 30.000 (`3_000_000`), meta R$ 18.000 (`1_800_000`), fixos R$ 4.884 (`488_400`), parcelas R$ 4.393,88/mês (`439_388`), piso R$ 150 (`15_000`), ciclo = mês civil (nov/26 = 30 dias). Provisão = 0 nos exemplos abaixo. USD: US$ 7.300 (`730_000` cents de USD), cotação 5,43 (`5_430_000` micros), imposto R$ 3.500 (`350_000`).
- `Intl` formata BRL com NBSP (`"R$ 39.639,00"`). Asserções de texto comparam com `formatBRL(...)` ou normalizam ` ` → espaço.
- Commits convencionais, em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Ciclo sem nenhum snapshot perto do início** (primeiro fechamento após o deploy) — o dono espera que o fechamento use o `patrimonioFinalCents` do ciclo anterior ou peça valor manual, nunca feche com poupança real `0` silenciosa. Teste em Task 3 (`medirPoupancaReal` fallback) e Task 9 (`fecharCiclo` lança `PoupancaRealNaoMedidaError`).
2. **BCB fora do ar / timeout / fim de semana** — a página carrega com a última cotação salva e um aviso, nunca 500. Testes em Task 6 (fallback do serviço) e Task 7 (adapter: array vazio → dia anterior; `AbortError` → `null`).
3. **Imposto fixo E percentual preenchidos ao mesmo tempo** — recusado na action e no domínio (`RangeError`), em vez de somar os dois. Teste em Task 2.
4. **Confirmar renda real duas vezes** — o segundo confirm atualiza números mas não gera um segundo lançamento RENDA. Teste em Task 8.
5. **Parcela com `tipoVerbaOverride = 'DIA_A_DIA'`** — continua EXTRA (spec: "inclui toda parcela"). Teste em Task 3 (`tipoVerbaEfetivo`).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261104120000_poupanca_real_renda_usd_verbas/migration.sql` | colunas novas + tabela `Cotacao` |
| `src/domain/model/enums.ts`, `entidades.ts` | `TipoVerba`, `MoedaRenda`, `FonteMedicaoPoupanca`, `FonteCotacao`; campos novos; entidade `Cotacao` |
| `src/shared/dinheiro.ts` | `formatUSD`, `formatTaxaBRL` |
| `src/domain/finance/renda.ts` (novo) | câmbio, imposto, renda líquida prevista com decomposição, aplicar nova renda ao ciclo |
| `src/domain/finance/verbas.ts` (novo) | tipoVerba efetivo, split D1, consumo, explicação do piso |
| `src/domain/finance/poupanca-real.ts` (novo) | medição por snapshot, estimativa em curso, comparação com meta, médias, alertas |
| `src/domain/finance/projecao.ts`, `projecao-tipos.ts` | split por ciclo projetado |
| `src/domain/ports/cotacao.ts` (novo) | `CotacaoRepository`, `FonteCotacaoPort` |
| `src/application/cotacao.ts` (novo) | `obterCotacaoUsd` (cache → BCB → fallback + aviso) |
| `src/infrastructure/cambio/ptax-bcb.ts` (novo) | adapter PTAX com `fetch` injetado |
| `src/application/renda-ciclo.ts` (novo) | recalcular renda do ciclo e confirmar renda real (prévia + aplicar) |
| `src/application/ciclos.ts`, `fechamento.ts` | abertura com renda USD; poupança real e alertas no fechamento |
| read-models + telas | uma task por tela |
| `scripts/backfill-poupanca-real.ts` (novo) | backfill dos ciclos fechados |

---

### Task 1: Schema, migração e persistência dos campos novos

**Files:**
- Modify: `prisma/schema.prisma` (models `Config`, `Ciclo`, `Categoria`, `Transacao`; novo `Cotacao`)
- Create: `prisma/migrations/20261104120000_poupanca_real_renda_usd_verbas/migration.sql`
- Modify: `src/domain/model/enums.ts`, `src/domain/model/entidades.ts`
- Modify: `src/infrastructure/repositories/mappers.ts`, `src/infrastructure/repositories/prisma-repositories.ts` (Config `salvar`, Ciclo `criarSeAusente`/`atualizar`/`fecharSePendente`, Categoria `salvar`, Transacao `criar`/`atualizar`)
- Modify: `src/infrastructure/onboarding.ts` (categorias semeadas com `tipoVerba`), `src/infrastructure/backup.ts` (campos novos como `.optional()` no zod; `Cotacao` NÃO entra no backup — é pública e re-buscável)
- Modify: `src/application/__fakes__/fakes-ciclo-fechamento.ts` (defaults dos campos novos)
- Test: `src/infrastructure/backup.test.ts` (round-trip dos campos novos)

**Interfaces:**
- Produces (enums): `TIPO_VERBA = ['DIA_A_DIA','EXTRA']`, `type TipoVerba`; `MOEDA_RENDA = ['BRL','USD']`, `type MoedaRenda`; `FONTE_MEDICAO_POUPANCA = ['SNAPSHOT','SALDO_CONTAS','MANUAL']`, `type FonteMedicaoPoupanca`; `FONTE_COTACAO = ['PTAX_BCB','MANUAL']`, `type FonteCotacao`.
- Produces (entidades):
  - `Config` += `moedaRenda: MoedaRenda; rendaBrutaMoedaOrigemCents: number | null; impostoEstimadoCents: number | null; impostoEstimadoPercentual: number | null; fonteRenda: string | null`
  - `Ciclo` += `poupancaRealCents, patrimonioInicialCents, patrimonioFinalCents: number | null; fonteMedicaoPoupanca: FonteMedicaoPoupanca | null; rendaRealBrutaMoedaOrigemCents, cotacaoRealUsadaMicros, impostoRealCents, rendaRealLiquidaCents: number | null; cotacaoPrevistaMicros: number | null; cotacaoPrevistaData: DataCivil | null`
  - `Categoria` += `tipoVerba: TipoVerba`; `Transacao` += `tipoVerbaOverride: TipoVerba | null`
  - `interface Cotacao { data: DataCivil; moedaOrigem: 'USD'; moedaDestino: 'BRL'; taxaMicros: number; fonte: FonteCotacao }`

- [ ] **Step 1: Schema.** Campos acima no `schema.prisma`. `Config.moedaRenda String @default("BRL")`; `Categoria.tipoVerba String @default("EXTRA")`; demais nullable. `Ciclo.cotacaoPrevistaMicros Int?` e `cotacaoPrevistaData String?` congelam a cotação usada na renda prevista (card do dashboard precisa dela; ver "Ambiguidades"). Modelo `Cotacao { id String @id @default(cuid()); data String; moedaOrigem String; moedaDestino String; taxaMicros Int; fonte String; createdAt DateTime @default(now()); @@unique([data, moedaOrigem, moedaDestino]) }` — SEM `donoId` e SEM relação com `Usuario` (comentário citando D4).

- [ ] **Step 2: SQL à mão.** `ALTER TABLE` para cada coluna (tipos: `TEXT`, `INTEGER`, `DOUBLE PRECISION` para `impostoEstimadoPercentual`); `CREATE TABLE "Cotacao"` + `CREATE UNIQUE INDEX "Cotacao_data_moedaOrigem_moedaDestino_key"`. Backfill de categorias na MESMA migração, depois do `ADD COLUMN`:
  ```sql
  UPDATE "Categoria" SET "tipoVerba" = 'DIA_A_DIA'
   WHERE "nome" IN ('Mercado','Delivery','Restaurante','Transporte','Combustível','Farmácia');
  ```
  (todo o resto fica `EXTRA` pelo default — "categoria desconhecida → EXTRA"). Cabeçalho do SQL explica por que o backfill é por nome e que não há `DROP INDEX` do HNSW.

- [ ] **Step 3: Aplicar e registrar.**
  Run: `pnpm prisma db execute --file prisma/migrations/20261104120000_poupanca_real_renda_usd_verbas/migration.sql --schema prisma/schema.prisma && pnpm prisma migrate resolve --applied 20261104120000_poupanca_real_renda_usd_verbas && pnpm prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script && pnpm db:generate`
  Expected: diff vazio exceto `DROP INDEX "Memoria_embedding_hnsw_idx"`.

- [ ] **Step 4: Domínio + mappers + repos + onboarding + backup + fakes.** Enums/entidades acima; mappers convertem `String` → união (fallback `'EXTRA'` / `'BRL'` / `null` para valor desconhecido); repositórios persistem os campos novos (mantendo `findFirst`/`updateMany` com `donoId`); `onboarding.ts` ganha `tipoVerba` por categoria com a mesma lista do Step 2; `backup.ts` exporta/importa os campos novos como opcionais (backup antigo continua importável).

- [ ] **Step 5: Teste de round-trip do backup.** Em `backup.test.ts`, um caso `'preserva moedaRenda, tipoVerba, tipoVerbaOverride e poupancaRealCents no round-trip'`: exporta config com `moedaRenda: 'USD', rendaBrutaMoedaOrigemCents: 730_000, impostoEstimadoCents: 350_000`, categoria `Mercado` `DIA_A_DIA`, transação com `tipoVerbaOverride: 'EXTRA'`, ciclo com `poupancaRealCents: 425_000` → importa → `toEqual` nos mesmos valores. E `'importa backup antigo sem os campos novos'` → `moedaRenda === 'BRL'`, `tipoVerba === 'EXTRA'`.

- [ ] **Step 6: Verificar.** Run: `pnpm test && pnpm typecheck && pnpm verificar:isolamento` — Expected: tudo verde (isolamento não muda: `Cotacao` não tem dono).

- [ ] **Step 7: Commit** — `feat(schema): poupança real, renda em USD, tipoVerba e tabela Cotacao`

---

### Task 2: Domínio — câmbio, imposto, renda líquida e nova renda do ciclo

**Files:**
- Modify: `src/shared/dinheiro.ts` (+ testes em `src/shared/dinheiro.test.ts`)
- Create: `src/domain/finance/renda.ts`, `src/domain/finance/renda.test.ts`
- Modify: `src/domain/finance/index.ts` (re-export)

**Interfaces:**
- Produces:
  - `formatUSD(cents: number): string` → `formatUSD(730_000)` = `"US$ 7.300,00"` (Intl `pt-BR`, currency `USD`; normalize NBSP no teste).
  - `formatTaxaBRL(taxaMicros: number): string` → `5_430_000` → `"R$ 5,43"`; `5_430_600` → `"R$ 5,4306"` (mín. 2, máx. 4 casas; aritmética inteira).
  - `converterParaBrlCents(valorOrigemCents: number, taxaMicros: number): number` = `Math.floor(valor × taxa / 1_000_000)`; lança `RangeError` se o produto não for `Number.isSafeInteger`.
  - `calcularImpostoCents(p: { brutaBrlCents: number; impostoEstimadoCents: number | null; impostoEstimadoPercentual: number | null }): number` — fixo OU `floor(bruta × pct / 100)`; ambos preenchidos → `RangeError('Informe imposto fixo OU percentual, não os dois')`; nenhum → 0.
  - `interface RendaLiquida { moeda: MoedaRenda; liquidaCents: number; brutaOrigemCents: number | null; taxaMicros: number | null; dataCotacao: DataCivil | null; brutaBrlCents: number; impostoCents: number; decomposicao: string; motivoSemCotacao: string | null }`
  - `rendaLiquidaPrevista(config: Pick<Config,'moedaRenda'|'rendaBaseCents'|'rendaBrutaMoedaOrigemCents'|'impostoEstimadoCents'|'impostoEstimadoPercentual'>, cotacao: Pick<Cotacao,'data'|'taxaMicros'> | null): RendaLiquida`
  - `aplicarNovaRendaAoCiclo(ciclo: Pick<Ciclo,'verbaVariavelCents'|'rendaPrevistaCents'|'rendaRealLiquidaCents'|'poupancaAlvoCents'>, novaRendaCents: number, metaPoupancaPercent: number | null): { verbaVariavelCents: number; poupancaAlvoCents: number }` — por DELTA: `verba + (nova − (rendaRealLiquida ?? rendaPrevista))`, preservando rollover e puxada da reserva já embutidos na verba; meta só muda se `metaPoupancaPercent != null` (`floor(nova × pct / 100)`).

- [ ] **Step 1: Testes que falham** (`renda.test.ts`):
  - `converterParaBrlCents(730_000, 5_430_000)` → `3_963_900`.
  - `calcularImpostoCents({ brutaBrlCents: 3_963_900, impostoEstimadoCents: 350_000, impostoEstimadoPercentual: null })` → `350_000`; com `null, 10` → `396_390`; com `350_000, 10` → throws `RangeError`.
  - `rendaLiquidaPrevista({ moedaRenda: 'USD', rendaBaseCents: 3_000_000, rendaBrutaMoedaOrigemCents: 730_000, impostoEstimadoCents: 350_000, impostoEstimadoPercentual: null }, { data: '2026-11-03', taxaMicros: 5_430_000 })` → `liquidaCents: 3_613_900`, `brutaBrlCents: 3_963_900`, `impostoCents: 350_000`, `decomposicao` normalizada = `"US$ 7.300,00 × R$ 5,43 = R$ 39.639,00 − imposto R$ 3.500,00 = R$ 36.139,00"`, `motivoSemCotacao: null`.
  - mesmo config com imposto 10% → `liquidaCents: 3_567_510`.
  - USD com `cotacao = null` → `liquidaCents: 3_000_000` (cai em `rendaBaseCents`), `motivoSemCotacao` contém `"Sem cotação"`.
  - BRL → `liquidaCents: 3_000_000`, `taxaMicros: null`, `decomposicao` = `"R$ 30.000,00 (renda líquida em reais)"`.
  - `aplicarNovaRendaAoCiclo({ verbaVariavelCents: 2_511_600, rendaPrevistaCents: 3_000_000, rendaRealLiquidaCents: null, poupancaAlvoCents: 1_800_000 }, 3_613_900, null)` → `{ verbaVariavelCents: 3_125_500, poupancaAlvoCents: 1_800_000 }`; com verba `2_561_600` (rollover R$ 500 embutido) → `3_175_500`; com `metaPoupancaPercent: 50` → `poupancaAlvoCents: 1_806_950`; com `rendaRealLiquidaCents: 3_613_900` e nova `3_500_000` → verba `3_125_500 − 113_900`.

- [ ] **Step 2:** Run `pnpm test src/domain/finance/renda.test.ts src/shared/dinheiro.test.ts` — Expected: FAIL (funções inexistentes).
- [ ] **Step 3:** Implementar as assinaturas acima. `renda.ts` importa só `@/shared/*` e tipos de `@/domain/model`.
- [ ] **Step 4:** Run os mesmos testes + `pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(finance): conversão USD→BRL com imposto e nova renda do ciclo por delta`

---

### Task 3: Domínio — verbas separadas (split, consumo, piso explicado)

**Files:**
- Create: `src/domain/finance/verbas.ts`, `src/domain/finance/verbas.test.ts`
- Modify: `src/domain/finance/index.ts`

**Interfaces:**
- Consumes: `calcularTeto`, `contaComoVerbaVariavel` (`teto.ts`), `TransacaoCalc` (`tipos.ts`).
- Produces:
  - `tipoVerbaEfetivo(t: { tipoVerbaOverride: TipoVerba | null; tipoVerbaCategoria: TipoVerba | null; parcelamentoId: string | null }): TipoVerba` — parcela → sempre `EXTRA`; senão override ?? categoria ?? `EXTRA`.
  - `type TransacaoVerba = TransacaoCalc & { tipoVerba: TipoVerba }`
  - `interface DivisaoVerba { gastavelCents; diaADiaCents; extrasCents; faltaParaPisoCents: number }` (`faltaParaPisoCents = piso×dias − diaADia`, ≥ 0)
  - `dividirVerba(p: { verbaVariavelCents: number; poupancaAlvoCents: number; pisoDiarioCents: number; diasCiclo: number }): DivisaoVerba`
  - `interface ConsumoVerbas extends DivisaoVerba { extrasUsadoCents; extrasRestanteCents; excedenteExtrasCents; diaADiaEfetivoCents; diaADiaUsadoCents; diaADiaRestanteCents: number; tetoDiaADia: ResultadoTeto }`
  - `consumirVerbas(p: { divisao: DivisaoVerba; transacoes: readonly TransacaoVerba[]; hoje: DataCivil; dataFimCiclo: DataCivil }): ConsumoVerbas` — extras usado = DESPESA−ESTORNO EXTRA do ciclo INTEIRO até `dataFimCiclo` (parcela programada já é compromisso); `excedente = max(usado − max(extras,0), 0)`; `diaADiaEfetivo = diaADia − excedente`; `tetoDiaADia = calcularTeto({ verbaVariavelCents: diaADiaEfetivo, dataFimCiclo, hoje, transacoes: só DIA_A_DIA })`. Filtro de elegibilidade = `contaComoVerbaVariavel`.
  - `projetarDiaADiaDiarioCents(divisao: DivisaoVerba, extrasComprometidosCents: number, diasCiclo: number): number` = `floor(max(diaADia − max(comprometido − max(extras,0),0), 0) / dias)` (usado pela projeção, pelo modal e pelo copiloto).
  - `interface ExplicacaoPiso { faltaCents: number; necessarioCents: number; disponivelCents: number; causas: { causa: 'META' | 'PARCELAS' | 'RENDA_MENOR'; cents: number }[]; texto: string }`
  - `explicarPiso(p: { verbaVariavelCents; poupancaAlvoCents; parcelasCents; pisoDiarioCents; diasCiclo: number; rendaPrevistaCents: number; rendaRealLiquidaCents: number | null }): ExplicacaoPiso | null` — `null` se `verba − meta − parcelas ≥ piso × dias`. Causas não-nulas, maior primeiro; `RENDA_MENOR = max(prevista − real, 0)` só com real confirmada.

- [ ] **Step 1: Testes que falham** (`verbas.test.ts`), base nov/26 (30 dias), verba `2_511_600`:
  - `tipoVerbaEfetivo({ tipoVerbaOverride: 'DIA_A_DIA', tipoVerbaCategoria: 'DIA_A_DIA', parcelamentoId: 'p1' })` → `'EXTRA'`; `({ null, null, null })` → `'EXTRA'`; `({ 'EXTRA', 'DIA_A_DIA', null })` → `'EXTRA'`.
  - `dividirVerba({ 2_511_600, 1_800_000, 15_000, 30 })` → `{ gastavelCents: 711_600, diaADiaCents: 450_000, extrasCents: 261_600, faltaParaPisoCents: 0 }`.
  - USD (verba `3_125_500`) → `{ 1_325_500, 450_000, 875_500, 0 }`.
  - meta `2_200_000` → `{ 311_600, 311_600, 0, 138_400 }`.
  - meta `3_000_000` → `{ gastavelCents: -488_400, diaADiaCents: 0, extrasCents: -488_400, faltaParaPisoCents: 450_000 }` (extras negativa).
  - `consumirVerbas` com parcela EXTRA `439_388` em `2026-11-10` e `hoje = '2026-11-11'`: `extrasRestanteCents: -177_788`, `excedenteExtrasCents: 177_788`, `diaADiaEfetivoCents: 272_212`.
  - parcela programada em `2026-11-25` (futura) com hoje `2026-11-11` → já conta em extras (mesmos números acima).
  - DIA_A_DIA `100_000` em `2026-11-05`, sem extras, hoje `2026-11-11` → `tetoDiaADia.diasRestantes: 20`, `tetoDiaADia.tetoHojeCents: 17_500`.
  - ESTORNO EXTRA `39_388` abate o usado: `extrasUsadoCents: 400_000`.
  - transação sem categoria (grupo `null`) ou com `provisaoId` é ignorada.
  - `projetarDiaADiaDiarioCents({ diaADia 450_000, extras 261_600 }, 439_388, 30)` → `9_073`; com `0` → `15_000`.
  - `explicarPiso({ verba 2_511_600, meta 1_800_000, parcelas 439_388, piso 15_000, dias 30, rendaPrevista 3_000_000, rendaReal null })` → `faltaCents: 177_788`, `causas: [{META,1_800_000},{PARCELAS,439_388}]`, texto contém `formatBRL(177_788)` e `formatBRL(15_000)`; com parcelas `0` → `null`; com `rendaReal 2_800_000` → causas inclui `{ RENDA_MENOR, 200_000 }`.
- [ ] **Step 2:** Run `pnpm test src/domain/finance/verbas.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implementar. Não mexer em `verba.ts`/`teto.ts`.
- [ ] **Step 4:** Run o teste + `pnpm test src/domain/finance` (nada regride) + `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(finance): verbas dia a dia e extras derivadas da verba (D1)`

---

### Task 4: Domínio — poupança real, estimativa, médias e alertas

**Files:**
- Create: `src/domain/finance/poupanca-real.ts`, `src/domain/finance/poupanca-real.test.ts`
- Modify: `src/domain/finance/index.ts`

**Interfaces:**
- Produces:
  - `export const TOLERANCIA_SNAPSHOT_DIAS = 5; // ponytail: constante (D5), vira campo de Config se o dono pedir`
  - `snapshotMaisProximo(snapshots: readonly { data: DataCivil; totalCents: number }[], alvo: DataCivil, toleranciaDias?: number): { data: DataCivil; totalCents: number } | null` — menor `|diffDias|` dentro da tolerância; empate → o mais antigo.
  - `type MedicaoPoupanca = { status: 'MEDIDA'; fonte: 'SNAPSHOT'; inicialCents: number; finalCents: number; realCents: number; dataInicial: DataCivil | null; dataFinal: DataCivil } | { status: 'SEM_INICIO' | 'SEM_FIM'; motivo: string }`
  - `medirPoupancaReal(p: { dataInicio: DataCivil; dataFim: DataCivil; snapshots: readonly {...}[]; patrimonioFinalCicloAnteriorCents: number | null }): MedicaoPoupanca` — inicial = snapshot ±5d do início, senão `patrimonioFinalCicloAnteriorCents` (`dataInicial: null`); final = snapshot ±5d do fim.
  - `estimarPoupancaEmCurso(p: { dataInicio; hoje: DataCivil; snapshots; saldoContasCents: number; patrimonioFinalCicloAnteriorCents: number | null }): { realCents: number; fonte: 'SNAPSHOT' | 'SALDO_CONTAS'; estimado: true } | { realCents: null; motivo: string }` — atual = snapshot mais recente com `data ∈ [dataInicio, hoje]`, senão `saldoContasCents`.
  - `compararComMeta(realCents: number, metaCents: number): { diferencaCents: number; percentual: number | null }` — `percentual` com 1 casa, SEM limite em 100, `null` se meta ≤ 0.
  - `mediaPoupancaReal(ciclosMaisRecentesPrimeiro: readonly { poupancaRealCents: number | null }[], n: number): { mediaCents: number | null; ciclosConsiderados: number }` — olha os `n` primeiros, ignora `null`, `floor`.
  - `alertaLancamentosFaltando(p: { rendaCents; fixosCents; despesasLancadasCents; poupancaRealCents: number }): { semExplicacaoCents: number; limiarCents: number } | null` — `sem = renda − (fixos + despesas) − real`; `limiar = max(100_000, floor(renda × 5 / 100))`; alerta quando `sem > limiar`.
  - `alertaGastoVariavelBaixo(p: { gastoVariavelCents: number; gastosAnterioresCents: readonly number[] }): { mediaAnteriorCents: number; percentual: number } | null` — dispara quando `gasto < 30%` da média; sem anteriores → `null`.

- [ ] **Step 1: Testes que falham** — snapshots `[{ '2026-10-31', 25_000_000 }, { '2026-11-29', 25_425_000 }]`, ciclo `2026-11-01..2026-11-30`:
  - `medirPoupancaReal` → `MEDIDA`, `inicialCents 25_000_000`, `finalCents 25_425_000`, `realCents 425_000`.
  - snapshot inicial em `2026-11-06` (5 dias) → usado; em `2026-11-07` (6 dias) com `patrimonioFinalCicloAnteriorCents: null` → `SEM_INICIO` com `motivo` não vazio; com `24_900_000` → `MEDIDA`, `inicialCents 24_900_000`, `dataInicial null`.
  - sem snapshot até `2026-12-05` → `SEM_FIM`.
  - empate `2026-10-30` e `2026-11-03` para alvo `2026-11-01`... (ambos a 2 e 2 dias) → escolhe `2026-10-30`.
  - `estimarPoupancaEmCurso` hoje `2026-11-15`, sem snapshot no ciclo, `saldoContasCents 25_200_000`, inicial do snapshot `2026-10-31` → `{ realCents: 200_000, fonte: 'SALDO_CONTAS' }`; com snapshot `2026-11-14` de `25_300_000` → `{ 300_000, 'SNAPSHOT' }`; sem inicial → `realCents null` + motivo.
  - `compararComMeta(425_000, 1_800_000)` → `{ diferencaCents: -1_375_000, percentual: 23.6 }`; `(2_000_000, 1_800_000)` → `percentual: 111.1`; meta 0 → `percentual: null`.
  - `mediaPoupancaReal([425_000, 600_000, 380_000, null, 500_000].map(...), 3)` → `{ mediaCents: 468_333, ciclosConsiderados: 3 }`; `n = 6` → `{ 476_250, 4 }`; tudo null → `{ null, 0 }`.
  - `alertaLancamentosFaltando({ renda 3_613_900, fixos 488_400, despesas 1_500_000, real 425_000 })` → `{ semExplicacaoCents: 1_200_500, limiarCents: 180_695 }`; com despesas `2_000_000`, real `1_100_000` → `null` (25_500 < 180_695); renda `1_000_000` → limiar `100_000`.
  - `alertaGastoVariavelBaixo({ 300_000, [2_000_000, 1_800_000, 2_200_000] })` → `{ mediaAnteriorCents: 2_000_000, percentual: 15 }`; `700_000` → `null`; `[]` → `null`.
- [ ] **Step 2:** Run `pnpm test src/domain/finance/poupanca-real.test.ts` — FAIL.
- [ ] **Step 3:** Implementar (datas via `diffDias` de `@/shared/data`).
- [ ] **Step 4:** Run + `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(finance): poupança real por snapshot, estimativa, médias e alertas`

---

### Task 5: Domínio — split nos ciclos projetados

**Files:**
- Modify: `src/domain/finance/projecao-tipos.ts` (`CicloProjetado`, `DeltaCiclo`), `src/domain/finance/projecao.ts` (`montarCiclo`)
- Test: `src/domain/finance/projecao.test.ts`

**Interfaces:**
- Consumes: `dividirVerba`, `projetarDiaADiaDiarioCents` (Task 3).
- Produces: `CicloProjetado` += `diaADiaCents; extrasCents; extrasRestanteCents (= extras − parcelasComprometidas); diaADiaDiarioCents`. `DeltaCiclo` += `extrasRestanteCents; diaADiaDiarioCents; passouAReduzirDiaADia: boolean` (cenário reduz `diaADiaDiarioCents` vs base). `montarCiclo` passa a receber `pisoDiarioVerbaCents` (já recebe) e usa as parcelas do ciclo como extras comprometidos. `verbaVariavelCents`, `verbaLivreCents` e `abaixoDoPiso` NÃO mudam.

- [ ] **Step 1: Testes que falham** em `projecao.test.ts`: ciclo nov/26 com renda `3_000_000`, fixos `488_400`, meta `1_800_000`, piso `15_000`, obrigações `439_388` → `diaADiaCents 450_000`, `extrasCents 261_600`, `extrasRestanteCents -177_788`, `diaADiaDiarioCents 9_073`, `verbaVariavelCents 2_511_600` (inalterada). Cenário de compra `R$ 3.000 em 3x` (`300_000`) sobre base sem parcelas → `delta[0].passouAReduzirDiaADia === false` (extras 261_600 cobre 100_000); compra `R$ 9.000 em 3x` → `true`.
- [ ] **Step 2:** Run `pnpm test src/domain/finance/projecao.test.ts` — FAIL.
- [ ] **Step 3:** Implementar no `montarCiclo` (lugar único) e no cálculo do delta.
- [ ] **Step 4:** Run `pnpm test src/domain/finance && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(projecao): verbas dia a dia e extras por ciclo projetado`

---

### Task 6: Aplicação — porta de cotação e `obterCotacaoUsd`

**Files:**
- Create: `src/domain/ports/cotacao.ts`, `src/application/cotacao.ts`, `src/application/cotacao.test.ts`
- Modify: `src/application/deps.ts`, `src/application/__fakes__/fakes-ciclo-fechamento.ts` (fake em memória de `CotacaoRepository`)

**Interfaces:**
- Produces:
  - `interface CotacaoRepository { obter(data: DataCivil): Promise<Cotacao | null>; ultimaAte(data: DataCivil): Promise<Cotacao | null>; salvar(c: Cotacao): Promise<Cotacao> }` (upsert pelo unique; moeda fixa USD→BRL).
  - `interface FonteCotacaoPort { buscarPtaxVenda(data: DataCivil): Promise<Cotacao | null> }` (`null` = não conseguiu; nunca lança para o chamador).
  - `Deps` += `cotacoes: CotacaoRepository; fonteCotacao?: FonteCotacaoPort`.
  - `export const IDADE_MAXIMA_CACHE_DIAS = 3; // ponytail: cotação de até 3 dias serve para previsão mensal; refetch diário se precisar`
  - `obterCotacaoUsd(deps: Deps, data?: DataCivil): Promise<{ cotacao: Cotacao | null; aviso: string | null }>` — `data` default `deps.relogio.hoje()`. 1) `ultimaAte(data)` com idade ≤ 3 dias → devolve sem rede; 2) `fonteCotacao.buscarPtaxVenda(data)` → `salvar` → devolve; 3) falha → última salva + aviso `"Não consegui consultar o Banco Central; usando a cotação de DD/MM/AAAA."`; 4) nada salvo → `{ cotacao: null, aviso: "Sem cotação salva…" }`. Nunca lança.
  - `salvarCotacaoManual(deps: Deps, data: DataCivil, taxaMicros: number): Promise<Cotacao>` — `exigirEscrita(deps.ator)` primeiro; fonte `MANUAL`.

- [ ] **Step 1: Testes que falham** (`cotacao.test.ts`, relógio fixo `2026-11-04`): cache `2026-11-03` → não chama a fonte (spy com 0 chamadas); cache `2026-10-30` (5 dias) + fonte devolve `{ '2026-11-04', 5_430_000 }` → devolve e salva; fonte devolve `null` → devolve a de `2026-10-30` com aviso contendo `"30/10/2026"`; fonte lança → mesmo comportamento; sem fonte (`fonteCotacao` undefined) e sem cache → `{ cotacao: null, aviso }` não nulo; `salvarCotacaoManual` com ator VIEWER → lança.
- [ ] **Step 2:** Run `pnpm test src/application/cotacao.test.ts` — FAIL.
- [ ] **Step 3:** Implementar; atualizar o builder de deps dos fakes.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS (todos os testes que montam `Deps` compilam com o fake novo).
- [ ] **Step 5: Commit** — `feat(cotacao): porta e caso de uso de cotação USD com cache e fallback`

---

### Task 7: Infraestrutura — adapter PTAX/BCB e repositório Prisma de `Cotacao`

**Files:**
- Create: `src/infrastructure/cambio/ptax-bcb.ts`, `src/infrastructure/cambio/ptax-bcb.test.ts`, `src/infrastructure/repositories/prisma-cotacao.ts`
- Modify: `src/composition.ts`

**Interfaces:**
- Consumes: `FonteCotacaoPort`, `CotacaoRepository` (Task 6).
- Produces:
  - `class PtaxBcb implements FonteCotacaoPort { constructor(fetchFn: typeof fetch = fetch, opcoes?: { timeoutMs?: number /* 3000 */; diasParaTras?: number /* 7 */ }) }` — URL exata: `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='MM-DD-YYYY'&$format=json`; lê `value[0].cotacaoVenda`; `value: []` → tenta dia anterior até `diasParaTras`; `taxaMicros = Math.round(cotacaoVenda × 1_000_000)` (única conversão de float, na fronteira); timeout via `AbortSignal.timeout(timeoutMs)`; qualquer erro/HTTP≠200/JSON inválido → `null` + `console.warn`.
  - `class PrismaCotacaoRepository implements CotacaoRepository` — SEM `donoId` (comentário citando D4: dado público); `salvar` = `upsert` no unique composto; `ultimaAte` = `findFirst({ where: { data: { lte }, moedaOrigem: 'USD', moedaDestino: 'BRL' }, orderBy: { data: 'desc' } })`.
  - `composition.ts`: `cotacoes: new PrismaCotacaoRepository(prisma)`, `fonteCotacao: new PtaxBcb()`.

- [ ] **Step 1: Testes que falham** (`ptax-bcb.test.ts`, `fetch` fake — D10):
  - data `2026-11-04` → fake recebe URL terminando em `@dataCotacao='11-04-2026'&$format=json`; resposta `{ value: [{ cotacaoVenda: 5.4306 }] }` → `{ data: '2026-11-04', taxaMicros: 5_430_600, fonte: 'PTAX_BCB', moedaOrigem: 'USD', moedaDestino: 'BRL' }`.
  - `2026-11-01` (domingo): fake devolve `value: []` para 11-01 e 10-31, `5.43` para 10-30 → `{ data: '2026-10-30', taxaMicros: 5_430_000 }`; fake chamado 3 vezes.
  - fake rejeita com `DOMException('…','AbortError')` → `null`; HTTP 500 → `null`; 8 dias vazios → `null` após 8 chamadas.
- [ ] **Step 2:** Run `pnpm test src/infrastructure/cambio/ptax-bcb.test.ts` — FAIL.
- [ ] **Step 3:** Implementar adapter, repo e ligação no composition.
- [ ] **Step 4:** Run o teste + `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(cambio): adapter PTAX do BCB com fetch injetado e repositório de cotação`

---

### Task 8: Aplicação — renda do ciclo (abertura em USD, recalcular renda, confirmar renda real)

**Files:**
- Create: `src/application/renda-ciclo.ts`, `src/application/renda-ciclo.test.ts`
- Modify: `src/application/ciclos.ts` (`garantirCicloAtual`), `src/application/config.ts` (`atualizarConfig` grava `rendaBaseCents` derivado quando USD)
- Test: `src/application/ciclos.test.ts`

**Interfaces:**
- Consumes: `rendaLiquidaPrevista`, `aplicarNovaRendaAoCiclo`, `converterParaBrlCents`, `calcularImpostoCents` (Task 2); `dividirVerba` (Task 3); `obterCotacaoUsd` (Task 6); `criarTransacao` (`transacoes.ts`).
- Produces:
  - `garantirCicloAtual`: ao CRIAR ciclo, `rendaPrevistaCents = rendaLiquidaPrevista(config, await deps.cotacoes.ultimaAte(inicio)).liquidaCents` (só cache — layout não faz rede) e grava `cotacaoPrevistaMicros`/`cotacaoPrevistaData`. BRL: idêntico a hoje.
  - `atualizarConfig`: se `moedaRenda === 'USD'`, busca `obterCotacaoUsd` e grava `rendaBaseCents = liquidaCents` (leitores legados — onboarding "renda configurada", projeção — continuam corretos).
  - `interface ImpactoRenda { rendaAntesCents; rendaDepoisCents; verbaAntesCents; verbaDepoisCents; diaADiaDiarioAntesCents; diaADiaDiarioDepoisCents; extrasAntesCents; extrasDepoisCents: number; decomposicao: string; aviso: string | null }`
  - `previaRecalculoRenda(deps): Promise<ImpactoRenda>` / `recalcularRendaDoCiclo(deps): Promise<Ciclo>` — nova renda prevista a partir da Config + `obterCotacaoUsd`; atualiza `rendaPrevistaCents`, `verbaVariavelCents`, `poupancaAlvoCents`, `cotacaoPrevista*`. Recusa se ciclo já tem renda real confirmada (`RendaJaConfirmadaError`).
  - `interface RendaRealInput { brutaOrigemCents?: number; taxaMicros?: number; impostoCents?: number; liquidaCents?: number; gerarLancamento: boolean }` (USD exige os três primeiros; BRL exige `liquidaCents`; validação lança `RangeError`).
  - `previaConfirmacaoRendaReal(deps, cicloId, input): Promise<ImpactoRenda & { lancamento: { valorCents: number; data: DataCivil; descricao: string } | null }>`
  - `confirmarRendaReal(deps, cicloId, input): Promise<Ciclo>` — `exigirEscrita` na 1ª linha; grava `rendaReal*` + verba/meta via `aplicarNovaRendaAoCiclo`; mantém `rendaPrevistaCents`; ciclo fechado → `CicloFechadoError` existente; gera `Transacao` RENDA (`criarTransacao`, `tipo: 'RENDA'`, `data = min(hoje, dataFim)`, `categoriaId` = 1ª categoria de grupo RENDA ou `null`, `contaId: null`) só quando `gerarLancamento` E o ciclo ainda não tinha `rendaRealLiquidaCents` (re-confirmação não duplica).

- [ ] **Step 1: Testes que falham** (`renda-ciclo.test.ts` com fakes; ciclo nov/26 verba `2_511_600`, renda `3_000_000`; config USD 730_000 / imposto 350_000; cotação em cache `5_430_000`):
  - `previaRecalculoRenda` → `rendaDepoisCents 3_613_900`, `verbaDepoisCents 3_125_500`, `diaADiaDiarioDepoisCents 15_000`, `extrasDepoisCents 875_500`; repo inalterado.
  - `recalcularRendaDoCiclo` → ciclo com `rendaPrevistaCents 3_613_900`, `verbaVariavelCents 3_125_500`, `cotacaoPrevistaMicros 5_430_000`.
  - `confirmarRendaReal(..., { brutaOrigemCents: 730_000, taxaMicros: 5_500_000, impostoCents: 350_000, gerarLancamento: true })` → `rendaRealLiquidaCents 3_665_000`, `rendaPrevistaCents 3_000_000` preservada, verba `2_511_600 + 665_000 = 3_176_600`, 1 transação RENDA de `3_665_000`; chamar de novo com `taxaMicros 5_430_000` → `rendaRealLiquidaCents 3_613_900`, verba `3_125_500`, ainda 1 transação RENDA.
  - VIEWER → lança; ciclo fechado → `CicloFechadoError`; USD sem `taxaMicros` → `RangeError`.
  - Em `ciclos.test.ts`: config USD + cache `5_430_000` → ciclo novo nasce com `rendaPrevistaCents 3_613_900`; sem cache → `config.rendaBaseCents`.
- [ ] **Step 2:** Run `pnpm test src/application/renda-ciclo.test.ts src/application/ciclos.test.ts` — FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(ciclo): renda do ciclo em USD, recálculo com prévia e confirmação da renda real`

---

### Task 9: Aplicação — poupança real e alertas no fechamento

**Files:**
- Modify: `src/application/fechamento.ts`
- Test: `src/application/fechamento.test.ts`

**Interfaces:**
- Consumes: `medirPoupancaReal`, `alertaLancamentosFaltando`, `alertaGastoVariavelBaixo`, `compararComMeta` (Task 4).
- Produces:
  - `ResumoFechamento` += `medicao: MedicaoPoupanca; comparacao: { diferencaCents; percentual } | null; alertaFaltando: {...} | null; alertaGastoBaixo: {...} | null; rendaSugeridaCents: number` (= `rendaRealLiquidaCents ?? rendaPrevistaCents`, para pré-preencher o passo de renda).
  - `FechamentoInput` += `poupancaRealManualCents?: number | null`.
  - `class PoupancaRealNaoMedidaError extends Error` — lançada ANTES de `fecharSePendente` quando a medição (considerando o snapshot do próprio input, se houver) não é `MEDIDA` e não veio valor manual; ciclo continua aberto.
  - `fecharCiclo` grava no patch atômico `poupancaRealCents`, `patrimonioInicialCents`, `patrimonioFinalCents`, `fonteMedicaoPoupanca` (`SNAPSHOT` ou `MANUAL`; manual → inicial/final `null`). `ResultadoFechamento` += `poupancaRealCents: number`.
  - Despesas lançadas p/ alerta = DESPESA − ESTORNO de TODAS as transações do ciclo (variável, parcela, provisão); gastos anteriores = `verbaVariavelCents − sobraCents` dos até 6 últimos fechados.

- [ ] **Step 1: Testes que falham** em `fechamento.test.ts`:
  - snapshot `2026-10-31` 25_000_000 já salvo + input com `snapshotData '2026-11-30'` somando 25_425_000 → ciclo fechado com `poupancaRealCents 425_000`, `fonteMedicaoPoupanca 'SNAPSHOT'`.
  - sem snapshot no fim e sem manual → `PoupancaRealNaoMedidaError`; `ciclo.fechado === false`; provisões não creditadas.
  - mesmo caso com `poupancaRealManualCents: 400_000` → fecha, `fonte 'MANUAL'`, `patrimonioInicialCents null`.
  - `obterResumoFechamento` com renda real `3_613_900`, fixos `488_400`, despesas `1_500_000`, snapshots que dão real `425_000` → `alertaFaltando.semExplicacaoCents 1_200_500`; `rendaSugeridaCents 3_613_900`.
  - 3 fechados anteriores com gasto 2_000_000/1_800_000/2_200_000 e atual 300_000 → `alertaGastoBaixo.percentual 15`.
- [ ] **Step 2:** Run `pnpm test src/application/fechamento.test.ts` — FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(fechamento): poupança real medida por snapshot, valor manual e alertas`

---

### Task 10: Tela `/` (painel desktop + Hoje mobile) — verbas, poupança real, renda

**Files:**
- Modify: `src/application/dashboard-tipos.ts`, `src/application/dashboard.ts`, `src/application/hoje.ts`, `src/application/mapeamento.ts` (`paraCalculoVerba`)
- Modify: `src/components/dashboard/metas-painel.tsx`, `src/components/dashboard/painel-desktop.tsx`, `app/page.tsx`
- Create: `src/components/dashboard/verbas-painel.tsx`, `src/components/dashboard/renda-ciclo-card.tsx`
- Test: `src/application/dashboard.test.ts`

**Interfaces:**
- Consumes: `tipoVerbaEfetivo`, `dividirVerba`, `consumirVerbas`, `explicarPiso` (Task 3); `estimarPoupancaEmCurso`, `compararComMeta` (Task 4); ciclo com `cotacaoPrevista*`/`rendaReal*` (Tasks 1, 8).
- Produces:
  - `paraCalculoVerba(transacoes: readonly Transacao[], categorias: readonly Categoria[]): TransacaoVerba[]` em `mapeamento.ts` (reusada por ciclo-view, copiloto).
  - `EstadoPainel` += `verbas: ResumoVerbas` com `ResumoVerbas = ConsumoVerbas & { pisoDiarioCents: number }`; `renda: ResumoRendaCiclo = { moeda; brutaOrigemCents|null; taxaMicros|null; dataCotacao|null; liquidaCents; confirmada: boolean; decomposicao: string }`.
  - `ResumoMetas` passa a ser `{ poupancaAlvoCents; guardadoCents: number | null; estimado: true; fonte: 'SNAPSHOT'|'SALDO_CONTAS'|null; motivoSemGuardado: string|null; diferencaCents: number|null; percentualReal: number|null; sobraDaVerbaCents; metaPoupancaPercent; avisoPiso: ExplicacaoPiso | null }` — `poupancaProjetadaCents`/`progressoPercentual` saem.
  - `EstadoHoje` += `diaADia: ConsumoVerbas` (mobile mostra "Posso gastar hoje" do dia a dia).

- [ ] **Step 1: Testes que falham** (`dashboard.test.ts`): ciclo nov/26 renda 3_000_000, meta 1_800_000, piso 15_000, parcela EXTRA 439_388 → `verbas.diaADiaEfetivoCents 272_212`, `verbas.extrasRestanteCents -177_788`; `metas.avisoPiso.faltaCents 177_788`; snapshot inicial 25_000_000 e saldo de contas 25_200_000 → `metas.guardadoCents 200_000`, `fonte 'SALDO_CONTAS'`, `percentualReal 11.1`; sem snapshot inicial → `guardadoCents null` + motivo; ciclo USD com `cotacaoPrevistaMicros 5_430_000` → `renda.decomposicao` contém `"US$ 7.300,00"`.
- [ ] **Step 2:** Run `pnpm test src/application/dashboard.test.ts` — FAIL.
- [ ] **Step 3:** Read-models. Componentes:
  - `VerbasPainel`: card **Dia a dia** ("Posso gastar hoje R$ X" = `tetoDiaADia.restaHojeCents`, gasto hoje, ritmo `diaADiaUsado/diaADiaEfetivo`) e card **Extras** (disponível no mês `extrasCents`, usado, restante; restante < 0 → "Extras estourados em R$ N — isso reduziu seu dia a dia para R$ X/dia"; `faltaParaPisoCents > 0` → "Faltam R$ N para cobrir o dia a dia").
  - `MetasPainel`: grid **Meta R$ X | Guardado de verdade R$ Y (estimado) | Diferença R$ Z** (verde ≥ 0, vermelho < 0) **| % real**; barra "Progresso" REMOVIDA; aviso do piso usa `avisoPiso.texto`. Nenhum "reservado", nenhum "−" na meta.
  - `RendaCicloCard`: "Renda do ciclo: US$ 7.300 · cotação R$ X (DD/MM) · líquido R$ Y" (BRL: só líquido); badge "confirmada" quando real.
  - `app/page.tsx` mobile: herói passa a ser o dia a dia; linha discreta com extras restantes.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS. Conferência visual com `pnpm dev` (desktop ≥1024px e mobile).
- [ ] **Step 5: Commit** — `feat(dashboard): cards dia a dia e extras, poupança real vs meta e renda do ciclo`

---

### Task 11: Tela `/ciclo` — split, recalcular renda e confirmar renda real

**Files:**
- Modify: `src/application/ciclo-view.ts`, `app/ciclo/page.tsx`, `src/components/ciclo/composicao-verba-card.tsx`, `src/actions/ciclos.ts`
- Create: `src/components/ciclo/renda-ciclo-acoes.tsx` (client: dois diálogos com prévia)
- Test: `src/application/ciclo-somente-leitura.test.ts` (ou novo `ciclo-view.test.ts`)

**Interfaces:**
- Consumes: `previaRecalculoRenda`, `recalcularRendaDoCiclo`, `previaConfirmacaoRendaReal`, `confirmarRendaReal` (Task 8); `dividirVerba` (Task 3).
- Produces: actions `previaRecalculoRendaAction()`, `recalcularRendaAction()`, `previaRendaRealAction(cicloId, input)`, `confirmarRendaRealAction(cicloId, input)` — zod (`int().nonnegative()` p/ cents e micros), `Resultado<T>` como as actions existentes, `revalidatePath('/')` e `'/ciclo'`. `EstadoCiclo` += `divisao: DivisaoVerba`, `renda: ResumoRendaCiclo`.

- [ ] **Step 1: Teste que falha:** `obterEstadoCiclo` devolve `divisao` `{ 711_600, 450_000, 261_600, 0 }` para o ciclo base.
- [ ] **Step 2:** Run `pnpm test src/application/ciclo-somente-leitura.test.ts` — FAIL.
- [ ] **Step 3:** Implementar. `ComposicaoVerbaCard` mostra, abaixo da verba, "Para bater a meta, gaste até R$ gastável — R$ dia a dia no dia a dia (R$ piso/dia) e R$ extras em extras", sem listar a meta com "−". `RendaCicloAcoes`: botão "Recalcular renda deste ciclo" abre prévia (antes → depois: renda, verba, dia a dia/dia, extras + decomposição + aviso de cotação) e só grava no "Confirmar"; botão "Confirmar renda real" com campos (USD: US$ bruto, cotação, imposto; BRL: líquido), checkbox "gerar lançamento de renda" e prévia do lançamento. Ambos atrás de `SomenteDono`.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS; conferir no browser o fluxo prévia → confirmar.
- [ ] **Step 5: Commit** — `feat(ciclo): recalcular renda e confirmar renda real com prévia`

---

### Task 12: Tela `/fechar-ciclo` — poupança real e alertas

**Files:**
- Modify: `src/components/fechar-ciclo/fechar-ciclo-wizard.tsx`, `passo-renda.tsx`, `resumo-final.tsx`, `src/actions/ciclos.ts` (`fecharCiclo` aceita `poupancaRealManualCents`; mapeia `PoupancaRealNaoMedidaError` para mensagem)
- Create: `src/components/fechar-ciclo/passo-poupanca-real.tsx`

**Interfaces:**
- Consumes: `ResumoFechamento.medicao/comparacao/alertaFaltando/alertaGastoBaixo/rendaSugeridaCents`, `FechamentoInput.poupancaRealManualCents` (Task 9).

- [ ] **Step 1:** `PassoRenda` pré-preenche com `rendaSugeridaCents`.
- [ ] **Step 2:** `PassoPoupancaReal` (depois do editor de patrimônio): mostra Meta | Guardado de verdade | Diferença | % real; se `medicao.status !== 'MEDIDA'` e o dono não preencheu o snapshot do fim, exige escolher "registrar snapshot" (volta ao editor) ou "informar manualmente" (`MoneyInput`) — botão Fechar desabilitado até um dos dois. `alertaFaltando` → "R$ N sem explicação — provavelmente há gastos não lançados" com link para `/` (lançamento) ; `alertaGastoBaixo` → "Seu gasto variável foi X% da média dos ciclos anteriores — faltou lançar algo?".
- [ ] **Step 3:** `ResumoFinal` mostra `poupancaRealCents` em vez de só a taxa de poupança.
- [ ] **Step 4:** Run `pnpm typecheck` — PASS; fechar um ciclo de teste no browser nos dois caminhos (snapshot / manual).
- [ ] **Step 5: Commit** — `feat(fechar-ciclo): passo de poupança real e alertas de gasto não lançado`

---

### Task 13: Tela `/historico` — poupança real, diferença e médias

**Files:**
- Modify: `src/domain/finance/historico.ts` (+ `historico.test.ts`), `src/application/historico.ts`, `src/components/historico/tabela-historico.tsx`, `app/historico/page.tsx`

**Interfaces:**
- Consumes: `compararComMeta`, `mediaPoupancaReal` (Task 4).
- Produces: `CicloHistoricoInput` += `poupancaRealCents: number | null`; `MesHistorico` += `poupancaRealCents: number | null; diferencaMetaCents: number | null; motivoSemPoupancaReal: string | null` (D-14); `EstadoHistorico` += `mediasPoupancaReal: { ciclos: 3 | 6 | 12; mediaCents: number | null; ciclosConsiderados: number }[]`.

- [ ] **Step 1: Testes que falham** em `historico.test.ts`: ciclo com real `425_000` e meta `1_800_000` → `diferencaMetaCents -1_375_000`; ciclo sem real → `null` + motivo `"Ciclo fechado antes da medição de poupança real…"`; médias com `[425_000, 600_000, 380_000, null, 500_000]` → 3: `468_333`, 6: `476_250` (4 ciclos), 12: `476_250`.
- [ ] **Step 2:** Run `pnpm test src/domain/finance/historico.test.ts` — FAIL.
- [ ] **Step 3:** Implementar; tabela ganha colunas "Poupança real" e "Diferença vs meta" (cor); cabeçalho da página mostra as três médias com "(N ciclos)".
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(historico): poupança real, diferença vs meta e médias 3/6/12`

---

### Task 14: Tela `/config` — renda USD, imposto, tipo de verba e sugestão de meta

**Files:**
- Modify: `src/actions/config.ts` (schema + `upsertCategoria` com `tipoVerba`), `src/application/config.ts` (`EstadoConfig`), `src/components/config/config-geral.tsx`, `src/components/config/gerenciadores.tsx` (`ListaCategorias`), `app/config/page.tsx`
- Test: `src/application/config.test.ts` (criar se não existir)

**Interfaces:**
- Consumes: `mediaPoupancaReal` (Task 4), `obterCotacaoUsd` (Task 6), `rendaLiquidaPrevista` (Task 2).
- Produces: `EstadoConfig` += `sugestaoMetaPorPoupancaReal: { mediaCents: number; ciclos: 3 } | null` (só com 3 ciclos medidos), `rendaPrevistaUsd: RendaLiquida | null`, `avisoCotacao: string | null`. Zod: `moedaRenda: z.enum(['BRL','USD'])`, `rendaBrutaMoedaOrigemCents`, `impostoEstimadoCents` `int().nonnegative().nullable()`, `impostoEstimadoPercentual: number().min(0).max(100).nullable()`, `.refine` "imposto fixo OU percentual"; `fonteRenda: string().max(60).nullable()`.

- [ ] **Step 1: Teste que falha:** 3 fechados com real `[425_000, 600_000, 380_000]` → `sugestaoMetaPorPoupancaReal.mediaCents 468_333`; 2 ciclos → `null`; `atualizarConfig` com USD + imposto fixo e percentual → erro de validação.
- [ ] **Step 2:** Run o teste — FAIL.
- [ ] **Step 3:** UI: seletor de moeda; em USD, campos "Renda bruta (US$)", "Imposto estimado" com alternância R$/% e "Fonte" (ex.: Deel), e a decomposição ao vivo do read-model; banner "Sua poupança real média dos últimos 3 ciclos foi R$ Y. Quer ajustar a meta?" com botão que só preenche o campo da meta (não salva sozinho); `ListaCategorias` ganha select Dia a dia / Extra por categoria.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(config): renda em USD com imposto, tipo de verba por categoria e sugestão de meta`

---

### Task 15: Tela `/projecao` — renda USD com slider de cotação e colunas de verba

**Files:**
- Modify: `src/application/projecao.ts` (`obterProjecao` opção `taxaMicros?`), `src/application/projecao-view.ts` (`LinhaProjecao` + CSV), `app/projecao/page.tsx`, `src/components/projecao/projecao-tabela.tsx`, `projecao-lista-mobile.tsx`, `premissas.tsx`
- Create: `src/lib/projecao-cotacao.ts` (`lerCotacao`), `src/components/projecao/cotacao-slider.tsx`
- Test: `src/application/projecao.test.ts`, `src/application/projecao-view.test.ts`

**Interfaces:**
- Consumes: `rendaLiquidaPrevista` (Task 2), `obterCotacaoUsd` (Task 6), `CicloProjetado` split (Task 5).
- Produces: `lerCotacao(param: string | string[] | undefined): number | null` — aceita `"5.43"`/`"5,43"`, clampa em `[4_800_000, 6_500_000]` micros, inválido → `null`. `obterProjecao(deps, { numCiclos, cenario?, taxaMicros? })`: em USD, renda dos ciclos futuros = `rendaLiquidaPrevista(config, { taxaMicros ?? cotação obtida })`; premissas ganham a decomposição e o aviso da cotação. `LinhaProjecao` += `diaADiaCents`, `extrasRestanteCents`, `diaADiaDiarioCents`.

- [ ] **Step 1: Testes que falham:** config USD, `taxaMicros: 6_000_000` → ciclo futuro `rendaPrevistaCents 4_380_000 − 350_000 = 4_030_000`; sem override com cache `5_430_000` → `3_613_900`; `lerCotacao('9')` → `6_500_000`, `lerCotacao('abc')` → `null`; CSV ganha colunas "Dia a dia", "Extras restantes".
- [ ] **Step 2:** Run `pnpm test src/application/projecao.test.ts src/application/projecao-view.test.ts` — FAIL.
- [ ] **Step 3:** Implementar. `CotacaoSlider` (client, `<input type="range" min=4.80 max=6.50 step=0.01>`) só aparece em USD e escreve `?cotacao=` na URL (mesmo padrão de `ProjecaoFiltros`); tabela/lista com colunas Dia a dia e Extras.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(projecao): renda USD com slider de cotação e colunas dia a dia e extras`

---

### Task 16: Modal de parcelamento — simulação nas duas verbas mês a mês

**Files:**
- Modify: `src/actions/parcelamentos.ts` (nova action), `src/components/dashboard/parcelamento-modal.tsx`
- Create: `src/application/simulacao-parcelamento.ts`, `src/application/simulacao-parcelamento.test.ts`

**Interfaces:**
- Consumes: `obterProjecao` com `cenario: { tipo: 'compraParcelada', ... }` e `DeltaCiclo` com split (Task 5).
- Produces: `simularImpactoParcelamento(deps, input: { descricao: string; valorTotalCents: number; numParcelas: number; dataCompra: DataCivil }): Promise<{ meses: { inicio: DataCivil; parcelaCents; extrasRestanteAntesCents; extrasRestanteDepoisCents; diaADiaDiarioAntesCents; diaADiaDiarioDepoisCents: number }[]; alerta: string | null }>` — horizonte = `numParcelas`; `alerta` = `"Essa compra vai reduzir seu dia a dia para R$ X/dia"` com o MENOR `diaADiaDiarioDepoisCents` entre os meses afetados, só se algum mês reduzir. Action `simularParcelamentoAction(input)` (leitura; sem `exigirEscrita`).

- [ ] **Step 1: Teste que falha:** base nov/26 sem parcelas (extras 261_600, dia a dia 15_000/dia); compra `R$ 13.181,64` em 3x (`439_388`/mês) → `meses[0].diaADiaDiarioDepoisCents 9_073`, `alerta` contém `formatBRL(9_073)`; compra `R$ 3.000` em 3x → `alerta null`.
- [ ] **Step 2:** Run `pnpm test src/application/simulacao-parcelamento.test.ts` — FAIL.
- [ ] **Step 3:** Implementar; o modal chama a action com debounce ao mudar valor/parcelas e mostra tabela compacta (mês · parcela · extras restantes · dia a dia/dia) + alerta antes do botão Salvar.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(parcelamento): simulação do impacto nas verbas dia a dia e extras`

---

### Task 17: Lançamentos — override de tipo de verba na edição

**Files:**
- Modify: `src/application/transacoes.ts` (`TransacaoInput.tipoVerbaOverride?: TipoVerba | null`; `editarTransacao` grava; parcela recusa override ≠ null com erro claro), `src/actions/transacoes.ts` (zod), `src/components/transacoes/transacao-edicao-form.tsx`
- Test: `src/application/transacoes.test.ts`

**Interfaces:**
- Consumes: `TipoVerba` (Task 1). Produces: `TransacaoInput.tipoVerbaOverride`.

- [ ] **Step 1: Testes que falham:** editar gasto de "Lazer" com `tipoVerbaOverride: 'DIA_A_DIA'` → persiste; `null` volta ao padrão; parcela com override → erro `"Parcela sempre consome extras"`.
- [ ] **Step 2:** Run `pnpm test src/application/transacoes.test.ts` — FAIL.
- [ ] **Step 3:** Implementar; form ganha select "Verba: padrão da categoria (X) / Dia a dia / Extras", desabilitado para parcela.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(transacoes): override de tipo de verba por lançamento`

---

### Task 18: Copiloto — poupança real, renda do ciclo e verbas

**Files:**
- Create: `src/application/ia/ferramentas/poupanca.ts`
- Modify: `src/application/ia/ferramentas/situacao.ts` (`estadoCiclo`, `situacaoHoje`), `src/application/ia/ferramentas/saida.ts`, `catalogo.ts`, `index.ts`, `src/application/ia/prompt-sistema.ts` (1 linha por ferramenta nova)
- Test: `src/application/ia/ferramentas/ferramentas.test.ts`, `catalogo.test.ts`

**Interfaces:**
- Consumes: read-models das Tasks 4, 8, 10, 13 (`paraCalculoVerba`, `consumirVerbas`, `estimarPoupancaEmCurso`, `mediaPoupancaReal`, `rendaLiquidaPrevista`).
- Produces:
  - `composicaoDasVerbas(p: DivisaoVerba & { verbaVariavelCents; poupancaAlvoCents; pisoDiarioCents; diasCiclo }): SaidaFerramenta` em `saida.ts` — partes + fórmula em texto (`"gastável = verba − meta; dia a dia = min(piso × dias, gastável); extras = gastável − dia a dia"`), `metaDePoupancaJaEstaNaVerba: false` (D-15/D-16).
  - Ferramenta `poupanca_real` (`poupancaRealFerramenta(deps)`): ciclo atual `{ meta, guardadoEstimado | null + motivo, fonte }`, últimos 12 fechados `{ inicio, meta, real | null + motivo, diferenca }`, médias 3/6/12.
  - Ferramenta `renda_do_ciclo` (`rendaDoCicloFerramenta(deps)`): `{ moeda, brutaUsd, cotacao + data, imposto, liquida, decomposicao, confirmada, rendaPrevista, rendaReal | null + motivo }`.
  - `estado_ciclo`/`situacao_hoje` += `verbas: { ...composicaoDasVerbas, extrasUsado, extrasRestante, diaADiaRestante, podeGastarHojeDiaADia }`.
  - Nenhuma escreve (regra 7b).

- [ ] **Step 1: Testes que falham:** `poupanca_real` sem snapshot inicial → `guardadoEstimado: null` e `motivo` string não vazia (D-14); `renda_do_ciclo` USD → `decomposicao` contém `"R$ 36.139,00"`; `estado_ciclo.verbas.formula` presente e `diaADia` = `dinheiro(450_000)`; `catalogo.test.ts` reconhece as 2 ferramentas novas como somente leitura.
- [ ] **Step 2:** Run `pnpm test src/application/ia/ferramentas` — FAIL.
- [ ] **Step 3:** Implementar e registrar.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(copiloto): ferramentas de poupança real, renda do ciclo e verbas separadas`

---

### Task 19: Copiloto — `simular_compra_parcelada` mês a mês nas duas verbas

**Files:**
- Modify: `src/application/ia/ferramentas/projecao.ts` (`cicloParaSaida`, `montarSaidaCenario`, `ROTULOS`)
- Test: `src/application/ia/ferramentas/ferramentas.test.ts`

**Interfaces:**
- Consumes: `CicloProjetado`/`DeltaCiclo` split (Task 5).
- Produces: `cicloParaSaida` += `diaADia`, `extrasRestante`, `diaADiaDiario` (via `dinheiros`); `impactoPorCiclo` += `variacaoExtrasRestante`, `diaADiaDiarioDepois`, `passouAReduzirDiaADia`; topo += `reduzDiaADia: boolean` e `alerta` (mesmo texto da Task 16); `ROTULOS` explica que parcela consome extras primeiro.

- [ ] **Step 1: Teste que falha:** compra `439_388 × 3` sobre base sem parcelas → `impactoPorCiclo[0].diaADiaDiarioDepois` = `dinheiro(9_073)`, `reduzDiaADia: true`.
- [ ] **Step 2:** Run `pnpm test src/application/ia/ferramentas/ferramentas.test.ts` — FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(copiloto): simulação de compra parcelada mostra dia a dia e extras`

---

### Task 20: Script de backfill da poupança real + gates finais

**Files:**
- Create: `scripts/backfill-poupanca-real.ts`, `src/application/backfill-poupanca-real.ts`, `src/application/backfill-poupanca-real.test.ts`
- Modify: `package.json` (`"backfill:poupanca": "tsx --env-file=.env scripts/backfill-poupanca-real.ts"`)

**Interfaces:**
- Consumes: `medirPoupancaReal` (Task 4), `CicloRepository.ultimosFechados`, `PatrimonioRepository.ultimosSnapshots`.
- Produces: `backfillPoupancaReal(deps: Deps, opcoes: { aplicar: boolean }): Promise<{ cicloId; dataInicio; status: 'MEDIDA' | 'SEM_INICIO' | 'SEM_FIM' | 'JA_TINHA'; realCents: number | null }[]>` — percorre fechados do mais antigo ao mais novo (para o `patrimonioFinalCicloAnteriorCents` encadear), só preenche ciclos com `poupancaRealCents == null`, grava `fonte 'SNAPSHOT'`; `aplicar: false` = dry-run. Script: roda para cada OWNER ativo, montando deps escopadas pelo mesmo caminho do `composition.ts` (como `scripts/projetar.ts`), imprime tabela, `--aplicar` para gravar.

- [ ] **Step 1: Testes que falham:** 3 fechados (set/out/nov) + snapshots `08-31 24_000_000`, `09-30 24_500_000`, `10-31 25_000_000`, `11-29 25_425_000` → reais `500_000`, `500_000`, `425_000`; dry-run não grava; ciclo com `poupancaRealCents` já preenchido → `JA_TINHA` intacto; sem snapshot no fim → `SEM_FIM`, nada gravado.
- [ ] **Step 2:** Run `pnpm test src/application/backfill-poupanca-real.test.ts` — FAIL.
- [ ] **Step 3:** Implementar caso de uso e script.
- [ ] **Step 4: Gates.** Run `pnpm test && pnpm typecheck`; parar o dev server (`lsof -ti:3000` vazio) e `pnpm build`; `pnpm verificar:isolamento`; `pnpm backfill:poupanca` (dry-run) e conferir a tabela antes de `--aplicar`. Expected: tudo verde.
- [ ] **Step 5: Commit** — `feat(scripts): backfill da poupança real dos ciclos fechados`

---

## Ambiguidades resolvidas neste plano

1. **"extras negativo → faltam R$ N para cobrir o dia a dia":** pela fórmula D1, `extras < 0` só quando `gastável < 0`. A frase "faltam R$ N para o dia a dia" sai de um campo próprio, `faltaParaPisoCents = piso×dias − diaADia`, que dispara também quando `0 ≤ gastável < piso×dias`.
2. **Consumo de extras usa o ciclo inteiro** (inclusive parcela com competência futura no ciclo): parcela é compromisso conhecido; o dia a dia já mostra o aperto desde o dia 1. O teto do dia a dia continua excluindo gasto futuro, via `calcularTeto`.
3. **"Estimado (saldo das contas)" durante o ciclo:** guardado estimado = (snapshot mais recente dentro do ciclo, senão soma de `Conta.saldoCents` das contas `incluiPatrimonio`) − patrimônio inicial. Rotulado "estimado"; `SALDO_CONTAS` só existe nessa estimativa, nunca é gravado no fechamento.
4. **Patrimônio inicial sem snapshot ±5 dias:** usa o `patrimonioFinalCents` do ciclo anterior (encadeia); sem ele, o fechamento pede snapshot ou valor manual.
5. **Renda prevista em USD na abertura do ciclo:** usa só a cotação em CACHE (sem rede no caminho do layout) e congela `cotacaoPrevistaMicros`/`cotacaoPrevistaData` (dois campos fora da lista da spec, necessários para o card "cotação R$ X (data)" bater com o número congelado). Sem cache → `Config.rendaBaseCents`, que a Config em USD mantém atualizado com a última conversão.
6. **Cache de cotação:** cotação de até 3 dias é reaproveitada sem chamar o BCB (`ponytail:`), para fim de semana e feriado não dispararem rede a cada página.
7. **Nova renda aplicada por delta** (`verba + (nova − anterior)`) em vez de recongelar tudo: preserva rollover e a puxada da reserva, e não mexe em fixos e provisão (para isso já existe o "recalcular ciclo atual").
8. **Re-confirmar renda real** atualiza os números mas não gera um segundo lançamento RENDA (`ponytail:`; ajuste do lançamento fica manual).
9. **"Tela" do simulador de compra parcelada** = o modal de parcelamento existente no dashboard (não há outra tela de simulação no app); não se cria página nova.
10. **Gasto lançado no alerta** = fixos congelados + DESPESA−ESTORNO de todas as transações do ciclo; provisão creditada não conta (continua no patrimônio). "Média dos ciclos anteriores" = até 6 últimos fechados, com gasto = `verba − sobra`.
11. **Sugestão de meta em /config** só aparece com 3 ciclos que tenham poupança real medida; o botão só preenche o campo, sem salvar.
12. **Fonte de renda** (`fonteRenda`) é texto livre (ex.: "Deel"), sem enum.
