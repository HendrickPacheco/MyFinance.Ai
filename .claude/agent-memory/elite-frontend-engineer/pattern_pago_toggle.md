---
name: pattern_pago_toggle
description: Optimistic checkbox pattern for "marcar como pago" (custos fixos / parcelas) and how server actions are wired across the RSC boundary.
metadata:
  type: project
---

Built 2026-08-03: "Pago?" tracking for custos fixos and parcelamentos in the
desktop dashboard (`src/components/dashboard/comprometido-lista.tsx`,
`parcelados-lista.tsx`), driven by `LinhaCustoFixo.pago/vencido` and
`LinhaParcelada.pago` in `src/application/dashboard-tipos.ts`.

**Why:** user migrated from a spreadsheet with a "Pago?" checkbox column per
fixed cost / installment. This is tracking only — SPEC regra 5 forbids it
from touching verba/teto math (fixed costs are already frozen into the cycle
at birth; installments are already transactions that consumed verba).

**How to apply / reuse:**
- `src/components/ui/index.tsx` now has a `Checkbox` primitive — stateless,
  controlled, same convention as `Input`/`Select` (no logic, just classes).
- `src/components/dashboard/pagamento-toggle.tsx` (`'use client'`) owns the
  optimistic state + rollback-on-failure + inline error. Reusable anywhere a
  boolean toggle needs 1-click-repeated-many-times UX with a server action.
  Visual state is never color-only: renders "Pago"/"Pendente" text alongside
  the checkbox (SPEC 11).
- **Passing server actions from Server Components to a Client Component
  prop**: a plain arrow-function closure over a `'use server'` action is
  NOT serializable across the RSC boundary and will throw. Use
  `serverAction.bind(null, id)` instead — Next.js recognizes bound server
  actions as a special serializable reference. Pattern used here:
  `onToggle={marcarCustoFixoPago.bind(null, custo.custoFixoId)}` where
  `ComprometidoLista`/`ParceladosLista` stay server components.
- **No monetary arithmetic in components, ever** (not even summing a
  filtered list's `valorCents` for a footer total) — confirmed by existing
  code already receiving `fixosTotalCents`/`parceladosTotalCents` as
  pre-computed props rather than reducing the array locally. When the
  contract lacks a needed aggregate (e.g. this task wanted "pago vs. a
  pagar" money totals per list, but `dashboard-tipos.ts` only has
  `faltaPagarCents`/`jaPagueiCents` combined across both lists, not split
  per list), the compliant fallback used was a plain **count** ("3 de 5
  pagos") — counting booleans isn't monetary arithmetic, arithmetic on
  `*Cents` fields is. Flag missing money-aggregate fields to the user/other
  agent instead of computing them locally.
- KPI faixa hierarchy: don't add an 8th equal-weight stat tile for two new
  related numbers. Grouped `faltaPagarCents`/`jaPagueiCents` into one
  `StatTilePagamento` tile (two stacked rows, smaller font than the primary
  tiles) inside the existing "Comprometido no mês" grid — keeps visual
  weight subordinate per SPEC 11 "hierarquia brutal".
- Guessed action names since another agent was building `src/actions/**` in
  parallel against the same contract: `marcarCustoFixoPago(custoFixoId,
  pago)` and `marcarParcelaPaga(transacaoId, pago)` in a new
  `src/actions/pagamentos.ts`, both `(id, pago) => Promise<Resultado<...>>`
  matching `src/actions/resultado.ts`'s `Resultado<T>` shape. Confirmed
  against the domain entity the other agent added
  (`PagamentoFixo { custoFixoId, cicloId, pagoEm }` and
  `Transacao.pagoEm`) — check these actions actually landed under those
  names before assuming the import resolves.
