---
name: use-server-helper-export-constraint
description: Next.js 'use server' files cannot export non-async helpers or helpers that take function arguments — shared logic between actions must live in a plain module without the directive.
metadata:
  type: project
---

In this repo, server action files (`src/actions/*.ts`) start with `'use server'`.
Next.js's server-actions compiler validates every export of such a file as if
it could be called directly from the client, which requires serializable
arguments. A helper like `executarComConfirmacao<T>(fn: () => Promise<T>)`
(takes a function as its argument) breaks that contract and must NOT be
exported from a `'use server'` file, even if it is only ever called by other
server actions in the same file.

**Why:** discovered while extracting `executarComConfirmacao` out of
`src/actions/transacoes.ts` so `src/actions/parcelamentos.ts` could reuse it
(TASKS-CUSTOS Fase 5). Exporting it directly from the `'use server'` file
would have violated the actions contract.

**How to apply:** when two or more `'use server'` action files need to share
a helper that isn't itself a plain async server action (e.g. it takes a
callback, returns a non-serializable type, or is a pure sync function), move
it to a plain module WITHOUT the `'use server'` directive — see
`src/actions/resultado.ts` (`executar`/`Resultado`) and the new
`src/actions/resultado-retroativo.ts` (`executarComConfirmacao`/
`ResultadoRetroativo`). Both are plain TS modules imported by the actual
`'use server'` files. Type-only exports (`export type X`) from a `'use
server'` file are fine — they're erased at runtime and never seen by the
actions compiler.
