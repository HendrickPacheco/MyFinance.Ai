# Plano — números incoerentes do dashboard (05/11/2026)

Spec: este plano + `CLAUDE.md` (D-11, D-16, regras invioláveis) + `SPEC.md`.
Branch: `worktree-fix-numeros-dashboard-d16`.

## Global Constraints (valem para TODA task)

- Dinheiro = `Int` em centavos, nome termina em `Cents`. Data civil = string `YYYY-MM-DD`,
  comparação lexicográfica, aritmética via `src/shared/data.ts`. Nunca `new Date("YYYY-MM-DD")`.
- Todo cálculo vive em `src/domain/finance/` (funções puras + teste Vitest). Application e
  componentes só orquestram.
- D-16: `verbaVariavel = renda − fixos − provisão + rollover`. A meta NÃO entra.
- D-11: parcela consome a verba UMA vez. `verbaLivre = verbaVariavel − parcelasDoCiclo`
  (soma das parcelas com competência no ciclo, pagas ou não).
- `gastável = verbaLivre − meta` — a ÚNICA vez em que a meta entra.
  `diaADia = min(pisoDiario × diasCiclo, max(0, gastável))`, `extras = gastável − diaADia`.
- Parcela NUNCA consome o balde dia a dia nem é contada de novo como gasto de extras
  (já foi deduzida em `verbaLivre`).
- Não mudar `prisma/schema.prisma`. Não criar transações, não marcar pagamento, não alterar
  saldos. Não mexer em auth/token da Agent API.
- Multi-tenant: repositório sempre filtrado por `donoId` (`findFirst({id, donoId})`, nunca
  `findUnique` por id).
- Gates por task: `pnpm typecheck` limpo e `pnpm test` verde. Commit ao final da task.
- NÃO rodar `next build` nem apagar `.next`.

Sanidade (ciclo nov/26, 30 dias, renda 3.500.000, fixos 762.800, provisão 0, rollover 0,
meta 1.800.000, parcelas 399.294, piso 8.333/dia):
verbaVariavel 2.737.200 · verbaLivre 2.337.906 · gastável 537.906 · diaADia 249.990
(8.333×30) · extras 287.916. Com piso mensal exato 250.000: diaADia 250.000, extras 287.906.

## Task 1: Motor de verbas (domain/finance/verbas.ts)

Arquivos: `src/domain/finance/verbas.ts`, `src/domain/finance/verbas.test.ts`
(e `index.ts` se exportar algo novo). Ajuste mínimo dos chamadores só para o typecheck passar.

1. `dividirVerba` ganha o parâmetro obrigatório `parcelasCents` (parcelas do ciclo) e devolve
   também `verbaLivreCents`:
   - `verbaLivreCents = verbaVariavelCents − parcelasCents`
   - `gastavelCents = verbaLivreCents − poupancaAlvoCents`
   - `diaADiaCents = min(max(gastavel, 0), pisoDiarioCents × diasCiclo)`
   - `extrasCents = gastavel − diaADiaCents`; `faltaParaPisoCents` como hoje.
   Nos chamadores existentes, passe por enquanto o valor de parcelas que já estiver à mão; se
   não houver, passe `0` com `// TODO(task2)` — a Task 2 faz o wiring certo.
2. `consumirVerbas`:
   - Transações de parcela (`parcelamentoId != null`) são IGNORADAS no consumo (já estão em
     `verbaLivre`). Se `TransacaoVerba` não carregar `parcelamentoId`, acrescente o campo ao tipo.
   - O balde dia a dia NÃO é mais reduzido por excesso de extras: `diaADiaEfetivoCents =
     diaADiaCents` (mantenha o campo por compatibilidade). O teto do dia a dia
     (`calcularTeto`) roda sobre `diaADiaCents` com os gastos DIA_A_DIA, como hoje.
   - Gasto DIA_A_DIA que passa do `diaADiaCents` come os extras:
     `extrasRestanteCents = extrasCents − extrasUsadoCents − max(0, diaADiaUsadoCents − diaADiaCents)`.
   - `excedenteExtrasCents = max(0, −extrasRestanteCents)` (informativo; não subtrai de nada).
   - `diaADiaRestanteCents = max(0, diaADiaCents − diaADiaUsadoCents)`.
   - `podeGastarHojeCents` continua `max(tetoDiaADia.restaHojeCents, 0)`.
3. `projetarDiaADiaDiarioCents(divisao, diasCiclo)`: vira `floor(max(diaADiaCents,0) / diasCiclo)`
   (remova o parâmetro de extras comprometidos e ajuste os chamadores).
4. Nova função pura `statusDiaADia(p: { diaADiaCents, diaADiaUsadoCents, extrasRestanteCents,
   gastavelCents, diasTotais, diasRestantes })` →
   `'SEM_VERBA_PARA_META' | 'ESTOURADO_USANDO_EXTRAS' | 'ACIMA_DO_RITMO' | 'RITMO_OK'`:
   - `gastavelCents < 0` → `SEM_VERBA_PARA_META` (o ciclo não comporta a meta; não é estouro por gasto)
   - senão, `diaADiaUsadoCents > diaADiaCents` ou `extrasRestanteCents < 0` → `ESTOURADO_USANDO_EXTRAS`
   - senão `ritmoDiaADiaOk(...)` → `RITMO_OK`, senão `ACIMA_DO_RITMO`.
5. `explicarPiso` fica como está.

Testes obrigatórios (valores exatos, em centavos) em `verbas.test.ts`:
- split: verbaVariavel 2.737.200, parcelas 399.294, meta 1.800.000, piso 8.333, dias 30 →
  verbaLivre 2.337.906, gastável 537.906, diaADia 249.990, extras 287.916.
- split com piso mensal exato 250.000 (piso 10.000, dias 25): gastável 537.906 → diaADia 250.000,
  extras 287.906.
- hero dia 5 de 30 (hoje 2026-11-05, fim 2026-11-30), sem gasto, diaADia 250.000 →
  `podeGastarHojeCents = floor(250000/26) = 9615`.
- parcelas não consomem: transação DESPESA com `parcelamentoId` de 399.294 no ciclo →
  `extrasUsadoCents 0`, `diaADiaUsadoCents 0`.
- gasto DIA_A_DIA de 300.000 (antes de hoje) com diaADia 250.000 → `podeGastarHojeCents 0`
  (nunca negativo), `extrasRestanteCents = extras − 50.000`, status `ESTOURADO_USANDO_EXTRAS`.
- REGRESSÃO −17.620,94: com verbaVariavel 437.200 (o valor bugado de prod) + parcelas 399.294 +
  meta 1.800.000 → gastável −1.362.094, diaADia 0, status `SEM_VERBA_PARA_META`; e com
  verbaVariavel 2.737.200 o `extrasRestanteCents` NUNCA é −1.762.094.

## Task 2: Wiring dashboard/home/projeção/renda/agente

Arquivos prováveis: `src/application/dashboard.ts`, `src/application/home.ts`,
`src/application/home-tipos.ts`, `src/components/dashboard/hero-hoje.tsx`,
`src/application/projecao-view.ts`, `src/domain/finance/projecao.ts` (se ele dividir verba),
`src/application/renda-ciclo.ts`, `src/application/simulacao-parcelamento.ts`,
`src/application/ia/ferramentas/*` e `src/agent-api/**` que exponham `diaADia`/`extras`/
`extrasRestante`/`diaADiaDiario` — mais os testes que existirem para eles.

1. Todo chamador de `dividirVerba` passa `parcelasCents` = soma das parcelas com competência
   no ciclo (ciclo atual: transações DESPESA do ciclo com `parcelamentoId != null`; projeção:
   `parcelasComprometidasCents` do ciclo projetado). Remova todos os `TODO(task2)`. Todo
   chamador de `consumirVerbas` passa `parcelamentoId` nas transações.
2. Home (`home.ts`): `hero.diaADiaCents = verbas.diaADiaCents` (≥ 0 sempre),
   `usadoDiaADiaCents = min(diaADiaUsado, diaADia)`, `progressoPercent` sobre esses dois.
   `hero.ritmoOk` vira `hero.status` (o enum de `statusDiaADia`); `hero-hoje.tsx` mostra:
   `RITMO_OK` "dia a dia · ritmo ok", `ACIMA_DO_RITMO` "dia a dia · acima do ritmo",
   `ESTOURADO_USANDO_EXTRAS` "dia a dia estourado, usando extras",
   `SEM_VERBA_PARA_META` "ciclo não comporta a meta". Não redesenhe — só texto/cor do status.
3. Card extras: `disponivelCents = extrasRestanteCents`, `totalCents = extrasCents`.
4. Projeção (payload de `/projecao` e IA): `diaADia`, `extras`, `extrasRestante`,
   `diaADiaDiario` calculados com o novo `dividirVerba` (parcelas já na verbaLivre; nunca
   `extras − parcelas` de novo). Para ciclos futuros, `extrasRestante = extras`.
5. Chart da home (`montarVerbaLivre`): rótulo de TODO ponto = `"<mês abreviado>/<aa>"`
   (ex.: `"nov/26"`, `"dez/26"`), único por ponto.
6. Atualize/adicione testes de application que cobrem esses campos (home.test, dashboard.test,
   projecao-view.test etc.).

## Task 3: Ciclos — recálculo com renda da Config + guarda de sobreposição

Arquivos: `src/application/ciclos.ts`, `src/application/ciclos.test.ts`,
`src/domain/finance/projecao.test.ts`, e o repositório de ciclos (porta em
`src/domain/ports/repositorios.ts`, adapter Prisma, fakes em `src/application/__fakes__/`)
SÓ se precisar de método novo.

1. `recalcularCicloAtual`: se o ciclo NÃO tem renda real confirmada
   (`rendaRealLiquidaCents == null`), a renda vem de `rendaPrevistaAoNascer(deps, config,
   ciclo.dataInicio)` (Config vigente) e o recálculo grava também `rendaPrevistaCents`/
   `cotacaoPrevistaMicros`/`cotacaoPrevistaData` — igual a `recalcularCicloAtualSeVazio`.
   Com renda real confirmada, mantém a real (D8). Ciclo fechado nunca muda. Teste: ciclo aberto
   com renda 3.000.000, Config renda 3.500.000, fixos 762.800, meta 1.800.000 → após recalcular:
   renda 3.500.000, verba 2.737.200.
2. Guarda de sobreposição em `garantirCicloAtual`: ao criar ciclo novo, pegue o ciclo mais
   recente do dono (maior `dataInicio`, aberto ou fechado); se `ultimo.dataFim >= inicio`
   calculado por `limitesCiclo`, use `proximoCicloApos(ultimo.dataFim, config.diaRecebimento)`.
   Testes: ciclo 2026-11-01..2026-11-30 existe, `diaRecebimento = 5`, hoje 2026-12-01 → novo
   ciclo 2026-12-01..2026-12-04 (NUNCA 2026-11-05..2026-12-04). Com `diaRecebimento = 1`,
   hoje 2026-12-01 → 2026-12-01..2026-12-31.
3. Projeção: teste em `src/domain/finance/projecao.test.ts` — ciclo congelado
   2026-11-01..2026-11-30, `diaRecebimento = 1`, 7 ciclos futuros → dez 01–31, jan 01–31,
   fev 01–28, mar 01–31, abr 01–30, mai 01–31; nenhum com `diasTotais < 28`.

## Task 4: Parcelamentos encerrados + reserva + card da meta

Arquivos prováveis: `src/application/agente-consultas.ts` (contexto `parcelamentosAtivos`),
`src/application/parcelamentos.ts`/`parcelados-view.ts`, `src/application/home.ts`,
`src/application/dashboard.ts`, `src/domain/finance/patrimonio.ts`,
`src/domain/finance/parcelamento.ts` (+ testes).

1. Função pura `parcelamentoEncerrado(p: { encerradoEm: string|null; dataUltimaParcela:
   DataCivil | null }, inicioCicloAtual: DataCivil): boolean` = `encerradoEm != null ||
   (dataUltimaParcela != null && dataUltimaParcela < inicioCicloAtual)`. `dataUltimaParcela`
   = maior `data` das transações do parcelamento. Use-a para tirar da lista de ativos do
   `GET /contexto` e de qualquer listagem de "ativos", do card Parcelado e do chip "terminam
   este mês". Nada é apagado nem gravado (não preencher `encerradoEm`). Teste: última parcela
   2026-10-15, ciclo começa 2026-11-01 → encerrado; última 2026-11-20 → ativo.
2. Reserva (home `montarReserva`): função pura `mesesCobertosPelaReserva({ saldoReservaCents,
   fixosCents, parcelasCents, diaADiaMensalCents })` = `saldo / (fixos + parcelas + diaADia)`,
   `null` se o divisor ≤ 0. Use `ciclo.fixosCents`, as parcelas do ciclo e `verbas.diaADiaCents`.
   Barra = `meses / 6`. Teste: 6.628.035 / (762.800 + 399.294 + 250.000) ≈ 4,69.
3. Card meta de poupança (não existe objetivo "carro" no domínio): alvo = meta do ciclo; o
   "guardado no ciclo (estimado)" da home passa a ser a função pura
   `poupancaEstimadaDoCicloCents({ verbaLivreCents, gastoVariavelSemParcelasCents,
   diaADiaRestanteCents, extrasRestanteCents })` = `max(0, verbaLivre − gastoVariavel −
   diaADiaRestante − max(extrasRestante, 0))`. Teste: verbaLivre 2.337.906, gasto 0,
   diaADiaRestante 250.000, extrasRestante 287.906 → 1.800.000.
