---
name: pattern_lancamento_painel
description: Keyboard-first expense entry form for the desktop panel, its digit-accumulation money input, global "N" shortcut, and undo-toast reuse.
metadata:
  type: project
---

Built 2026-08-03: `src/components/dashboard/lancamento-painel.tsx` — the desktop
counterpart to the mobile `src/components/hoje/lancamento-rapido.tsx` (touch
numpad + category chips). Desktop is keyboard-first: a normal form, Tab
navigates, Enter (from any field) submits.

**Why this shape:** before this, the desktop panel had no way to enter an
expense at all (`painel-desktop.tsx` only had read-only KPI/list blocks), so
the hero number was permanently stuck at "already spent R$0".

**Key technique — money input without `parseBRL` on free text:** the valor
`<Input>` is fully controlled, `value={formatBRL(centavos)}`, and
`onKeyDown` intercepts only digit keys (append via `c => c*10+d`, same rule
as mobile's `digitar`) and Backspace/Delete (`Math.floor(c/10)`); every other
printable key is blocked, navigation keys (Tab/Enter/Shift/arrows/Escape)
pass through untouched. `onChange` is a no-op. This sidesteps ambiguous
free-text money parsing entirely and reuses the exact safe pattern already
validated on mobile — no `Number()`/`parseBRL` call on user keystrokes.

**Sticky vs. reset fields after save:** only `centavos` and `descricao` reset
to empty after a successful submit; `categoriaId`/`metodo`/`data` stay as
they were. This is deliberate for the "lançar vários seguidos" flow (SPEC
7.1) — consecutive same-category entries need just value + Enter, no
re-selection. Revisit if user feedback says otherwise.

**Global shortcut:** window keydown listener for lowercase `n` (checked via
`e.key.toLowerCase()`), guarded by: no `metaKey`/`ctrlKey`/`altKey` (avoids
browser/OS shortcuts), and target isn't INPUT/TEXTAREA/SELECT/contentEditable
(avoids hijacking the letter while typing elsewhere, e.g. into `descricao`).
Registered/cleaned up in a `useEffect` with empty deps — listener does not
leak across navigations.

**2026-08-03 — moved into a `Modal` (see [[ui_primitives]]):** the owner
rejected the form as a permanently-visible strip at the top of the desktop
panel ("não deve ficar fixo na tela"). `LancamentoPainel` now owns its own
`open` boolean and renders its whole form as children of `Modal`; it's still
mounted unconditionally by `painel-desktop.tsx` (renders nothing when
closed) purely so its `window` listeners stay alive. Two ways to open it,
both funnel into the same component instance:
1. The global "N" keydown listener (unchanged guard logic above).
2. A `window` custom event, `EVENTO_ABRIR_LANCAMENTO` (exported from
   `lancamento-painel.tsx`), dispatched by a plain button in
   `src/components/layout/sidebar.tsx`.

**Why a window event and not Context/prop-drilling:** the sidebar lives in
`app/layout.tsx` and has zero access to `EstadoPainel.hoje`/
`categoriasLancamento` — those only exist where `painel-desktop.tsx` is
rendered. A Context provider would still need to sit above both the sidebar
and the panel, i.e. back in the layout, where the data doesn't exist either.
A named `window` event is the smallest channel between two branches of the
tree with no shared client ancestor holding the data — same category of
mechanism as the existing "N" listener, just triggered externally instead of
via keydown. The `<kbd>N</kbd>` hint moved from next to the valor label to
next to the sidebar button, since that's where the action (and the
discoverability need) now lives — SPEC 11 still requires the shortcut be
announced, just not necessarily where it fires.

**Esc-with-unsaved-draft rule:** closing (Esc, backdrop click, header "X")
all call one `pedirFechamento` function. If `centavos > 0` it does NOT close
— it swaps the form for a `ConfirmInline` ("Descartar o valor digitado?")
instead, so Esc can never silently drop a typed amount. If `centavos === 0`
it closes immediately. Chose "always the same rule regardless of close
method" over e.g. "Esc warns but backdrop click doesn't" specifically to
keep the behavior predictable no matter how the user tries to dismiss it.

**Undo pattern reused as-is** from `lancamento-rapido.tsx`: 5s
`window.setTimeout` toast with a "Desfazer" button calling
`excluirTransacao(toast.transacaoId)` then `router.refresh()`. Didn't
extract a shared hook — both files are small and the mobile one is
off-limits to edit; flag to consolidate into a shared hook only if a third
consumer appears.

**Contract dependency:** consumes `EstadoPainel.hoje` (DataCivil string) as
the date default and `EstadoPainel.categoriasLancamento` (`OpcaoCategoria[]`,
VARIAVEL-first, pre-sorted by usage) verbatim — no local reordering/filtering,
per explicit instruction. See [[project_architecture]] for the read-model
contract location (`src/application/dashboard-tipos.ts`).

Wired into `painel-desktop.tsx` (mounted unconditionally, right after
`KpiFaixa`, renders nothing until opened).
