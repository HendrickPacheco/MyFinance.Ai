---
name: ui_primitives
description: Inventory of src/components/ui/index.tsx primitives (Button, Card, Input, Select, Label, Badge, EmptyState) and their exact APIs.
metadata:
  type: project
---

All primitives live in the single file `src/components/ui/index.tsx` (hand-written, shadcn-style, server-safe — no `'use client'` needed since they're stateless). Do not modify this file for feature work; it's shared/backbone.

- `Button` — `variant?: 'primary'|'ghost'|'outline'|'danger'|'subtle'` (default `primary`), `size?: 'sm'|'md'|'lg'` (default `md`). Extends `ButtonHTMLAttributes`. `forwardRef`.
- `Card`, `CardHeader`, `CardTitle` (renders `<h3>`, uppercase muted label style), `CardContent` — plain div wrappers with token classes. `CardContent` defaults to `px-5 pb-5`; pass `className="p-0"` and manage your own item padding when rendering a `<ul>`/list inside (tailwind-merge correctly resolves the shorthand-vs-longhand conflict) — pattern used in `src/components/analise/ranking-corte.tsx` and reused in `src/components/fechar-ciclo/transacoes-sem-categoria.tsx`.
- `Input` — `forwardRef<HTMLInputElement>`, styled text input, accepts any `InputHTMLAttributes` including `type="date"`. No dedicated date-picker primitive exists in this codebase; native `<Input type="date">` is the convention for date fields (used in the fechar-ciclo patrimônio snapshot date).
- `Select` — `forwardRef<HTMLSelectElement>`, expects `<option>` children.
- `Label` — wraps `<label>`, `mb-1.5 block text-sm text-muted`.
- `Badge` — `tone?: 'neutral'|'positivo'|'atencao'|'negativo'`.
- `EmptyState({ titulo, descricao, acao? })` — standard "nothing here" state. `acao` is an optional `ReactNode` (typically a styled `Link`, not a nested `Button`+`Link`).

No form-library (react-hook-form etc.) is used anywhere in the codebase — forms are plain controlled `useState`. Money inputs are hand-rolled per-feature (kept local text state, parse via `parseBRL` on change, reformat via `formatBRL` on blur) since there's no shared `MoneyInput` primitive yet — I built one in `src/components/fechar-ciclo/money-input.tsx` for the fechar-ciclo wizard; worth promoting to `components/ui` if a second feature needs the same pattern.

See also [[design_system]], [[project_architecture]].
