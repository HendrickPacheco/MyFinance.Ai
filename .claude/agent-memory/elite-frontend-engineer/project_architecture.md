---
name: project_architecture
description: Hexagonal architecture and layering conventions for this personal-finance Next.js app — where data comes from and how pages are wired.
metadata:
  type: project
---

This is a dark-only Next.js 15 (App Router, React 19, TS strict) personal finance app ("Predictable Scaling" style — controle financeiro pessoal, ciclos mensais). Hexagonal architecture:

- `src/domain/model/entidades.ts` + `enums.ts` — pure domain types (Ciclo, Transacao, Config, ClassePatrimonio, etc.), no Prisma dependency.
- `src/domain/ports/*` — repository/port interfaces (e.g. `RelogioPort`, `CicloRepository`).
- `src/application/*` — use cases, pure functions taking a `Deps` bag (`src/application/deps.ts`). E.g. `src/application/fechamento.ts` has `obterResumoParaFechar`, `fecharCiclo`.
- `src/composition.ts` — THE only place that wires concrete infra (Prisma repos, `RelogioSistema`) into `Deps` via `criarDeps()`. Pages call `await criarDeps()` then pass to a use case.
- `src/actions/*.ts` — `'use server'` files. Always wrap logic in `executar()` from `src/actions/resultado.ts`, which returns `Resultado<T> = {ok:true,data:T} | {ok:false,erro:string}`. Actions call `revalidatePath` for affected routes at the end.
- `src/shared/dinheiro.ts` — THE only money kernel. All money is integer cents. Use `formatBRL(cents)` / `parseBRL(string)`. Never hand-roll currency math.
- `src/shared/data.ts` — THE only date kernel. All civil dates are `DataCivil = string` in `"YYYY-MM-DD"` format. Never use `new Date("YYYY-MM-DD")` for comparisons (UTC-shift bug called out explicitly in comments). `deps.relogio.hoje()` gives today's civil date respecting the configured timezone.

Route pages (`app/*/page.tsx`) are async Server Components: `criarDeps()` → call one `application` function → pass plain serializable data as props to a `'use client'` component in `src/components/<route-name>/`. See `app/analise/page.tsx` and `app/page.tsx` (Hoje) as the canonical examples.

`app/layout.tsx` already renders `<main className="mx-auto max-w-2xl ...">` wrapping `{children}` plus a bottom `<Nav>`. Route pages/components must NOT re-wrap in their own `<main>` or shell — just return content directly.

See also [[design_system]] and [[ui_primitives]].
