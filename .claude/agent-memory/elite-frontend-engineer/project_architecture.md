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

`app/layout.tsx` (as of 2026-08-03) implements "uma home responsiva": below `lg` (1024px) it's still the mobile shell (`max-w-2xl` column + bottom `<Nav>`, `lg:hidden`), at `lg`+ it becomes a desktop admin panel — `<Sidebar>` (`src/components/layout/sidebar.tsx`, `hidden lg:flex`, client component with `usePathname`) fixed left + `<main>` widened to `lg:max-w-[1600px]`. Critically `{children}` is rendered ONCE in the tree; only the surrounding flex/width classes change by breakpoint (`lg:flex-row`, `lg:max-w-none`, etc.) — do NOT duplicate `{children}` into two separate mobile/desktop subtrees (that double-mounts every client component and duplicates DOM ids). `src/components/layout/content-header.tsx` exports `ContentHeader` (`hidden lg:flex`, presentational only, props `{titulo, periodo?, acoes?}`) for pages that want a desktop-panel-style header — not yet wired into any page as of this writing. Route pages/components must NOT re-wrap in their own `<main>` — just return content directly; existing pages (`ciclo`, `analise`, `patrimonio`, `config`, `config/backup`, `fechar-ciclo`) got a `lg:max-w-3xl`/`lg:max-w-4xl` wrapper added to their root div only (no content redesign) so they don't stretch full 1600px width.

See also [[design_system]] and [[ui_primitives]].
