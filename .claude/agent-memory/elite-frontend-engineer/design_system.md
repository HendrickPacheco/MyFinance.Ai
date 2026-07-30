---
name: design_system
description: Dark-only design tokens, tone classes, and UI conventions used across this finance app (SPEC 11 references).
metadata:
  type: project
---

Dark-only app, no light theme. Tailwind with custom tokens (defined in `app/globals.css`, not yet inspected in depth — infer from usage):

- Surfaces: `bg-bg`, `bg-surface`, `bg-surface-2`.
- Borders: `border-border`, `border-border-strong`.
- Text: `text-fg` (primary), `text-muted` (secondary), `text-faint` (tertiary/disabled), `text-accent`.
- Semantic tone colors: `text-positivo` (green-ish, good/surplus), `text-atencao` (amber, warning), `text-negativo` (red, bad/overspend), `text-recuperacao` (used specifically for "modo recuperação" / deficit-handling UI — see `src/components/hoje/recuperacao-card.tsx`). When a screen shows a **déficit** (negative surplus at cycle close), prefer `text-recuperacao` over `text-negativo` to match the existing "recovery mode" visual language — confirmed pattern in `src/components/fechar-ciclo/passo-sobra.tsx` and `resumo-final.tsx`.
- Every monetary number gets the `tnum` class (tabular figures) alongside `formatBRL()`.
- Cards: `rounded-[var(--radius-card)] border border-border bg-surface` — but use the `Card` primitive, don't hand-roll.
- Mobile-first, interactive targets ≥44px tall (`min-h-[44px]`), buttons use `active:scale-[0.98]` or `active:scale-95` for tactile press feedback.
- No gamification, no confetti. Copy is factual and action-oriented, never celebratory/judgmental (e.g. déficit copy explains mechanics, doesn't scold).
- Icons: `lucide-react` (already a dependency), used sparingly (e.g. `AlertTriangle`, `LifeBuoy`, `CheckCircle2`, `ChevronLeft/Right`, `Plus`, `Trash2`).

Links styled as buttons (e.g. "voltar para Hoje" CTAs) are NOT nested inside the `Button` primitive — `Button` renders a real `<button>`, and nesting `<button>` inside `<a>`/`Link` is invalid HTML. Instead style the `Link` directly with the same Tailwind classes as `Button`'s primary variant. See `app/page.tsx`'s "Configurar agora" link and `src/components/fechar-ciclo/resumo-final.tsx`.

See also [[ui_primitives]] and [[project_architecture]].
