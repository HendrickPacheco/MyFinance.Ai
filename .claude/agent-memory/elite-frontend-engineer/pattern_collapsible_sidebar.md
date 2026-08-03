---
name: pattern_collapsible_sidebar
description: How the desktop sidebar (src/components/layout/sidebar.tsx) implements collapse/expand without hydration mismatch or flash, and how its icon-only tooltips avoid clipping.
metadata:
  type: project
---

Sidebar collapse state lives in TWO places on purpose, never one:

1. **Visual width** — decided entirely by CSS reacting to `data-sidebar="collapsed"|"expanded"`
   on `<html>`. That attribute is set by a synchronous inline `<script>` in `app/layout.tsx`
   (`SIDEBAR_ANTI_FLASH_SCRIPT`), executed in `<head>` before paint, reading
   `localStorage['financial:sidebar-collapsed']`. CSS rules live in `app/globals.css`
   (`.app-sidebar`, `.sidebar-label`). React state never drives the width — if it did,
   the server (which doesn't know the preference) and the client's first paint would
   disagree and either flash or warn.
2. **React state** (`collapsed` in `Sidebar()`) — only drives text/aria (`aria-expanded`,
   toggle label, tooltip content). It always initializes to `false` (matching the server's
   only possible guess) and corrects itself in a `useEffect` after mount by reading the same
   localStorage key. Because the CSS already applied the correct width pre-paint, this
   post-mount correction of text/aria is imperceptible — it's a normal setState, not a
   hydration mismatch.

**Gotcha found via browser testing**: even though the width comes from CSS and React state
starts consistent, React still hydrates the `<html>` element itself and notices the
inline script already wrote `data-sidebar="expanded"` there before hydration — server-rendered
`<html>` has no such attribute. This produced a real "hydrated but attributes didn't match"
console warning for the `<html>` tag specifically. Fix: `<html suppressHydrationWarning>`.
This suppresses only that element's own attribute/text diff, not its descendants, so it's
safe and standard (same trick `next-themes` uses).

**Tooltip gotcha**: a naive `position: absolute` tooltip anchored inside the sidebar breaks,
because the `<nav>` list has `overflow-y-auto` (needed for a long nav list to scroll) — and
per the CSS spec, setting only `overflow-y` to non-`visible` forces `overflow-x` to compute
to `auto` too, which clips anything positioned outside the box (even if nothing is currently
scrolled). Fixed by adding a `TooltipPortal` primitive to `src/components/ui/index.tsx`
(follows the `Modal` convention: `createPortal` to `document.body`, mount-guard for SSR) that
uses `position: fixed` computed from `getBoundingClientRect()` of the trigger — immune to any
ancestor's overflow/clipping. The tooltip is `aria-hidden`; the real accessible name always
comes from an explicit `aria-label` on the trigger, never from the (CSS-hidden-when-collapsed)
visible label text.

**Hooks-in-a-loop gotcha**: each sidebar item needs its own `useState`/`useCallback` pair for
tooltip show/hide (via a shared `useTooltipAncora(ativo)` hook). Calling a hook directly
inside the `ITENS.map()` callback violates rules-of-hooks (eslint flags it even though the
array is fixed-length). Fixed by extracting each item into its own small component
(`SidebarNavLink`, `ToggleSidebar`, `BotaoLancarGasto`) so hooks are called at each
component's top level, not inside a callback.

Related: [[design_system]], [[ui_primitives]].
