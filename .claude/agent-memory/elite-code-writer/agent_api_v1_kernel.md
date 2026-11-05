---
name: agent-api-v1-kernel
description: Where the agent-api REST kernel's pieces live and the shape future route handlers (built by other subagents) must follow
metadata:
  type: project
---

Built the foundation layer for the external-agent REST API (branch `feat/agent-api-v1`,
2026-11-04). Other subagents build ~60 route handlers on top of this — it's a stable
surface now, don't redesign it per-route.

**Kernel location**: `src/agent-api/` — `rotaAgente` (read) and `rotaEscrita` (write,
transactional) in `rotas.ts`, barrel-exported from `index.ts`. A route file imports only
from `@/agent-api`, never the internal files directly.

**Key design decisions** (see each file's own doc comment for the why):
- `criarDepsAgente(donoId, db)` in `src/composition.ts` — shares one repo-builder
  function (`construirRepositoriosDoDono`) with `criarDeps()`, so the two never diverge.
  `db` can be `prisma` or a tx client wrapped by `clienteEmTransacao` (also in
  `src/infrastructure/persistence/prisma.ts`) — needed because some repos call
  `this.db.$transaction(...)` internally and an interactive tx client doesn't have that method.
- Token auth (`src/agent-api/autenticacao.ts`) takes small injected FUNCTIONS
  (`buscarTokenPorHash`, `marcarTokenUsado`, `buscarUsuarioAtivo`), not whole repository
  instances — because the one unscoped `ApiTokenRepository` method
  (`buscarPorHashParaAutenticar`) and the scoped one (`marcarUsoAgora`) need different
  `donoId` wiring, and this keeps it trivially testable with inline fakes.
- `impactoCiclo` (`impacto-ciclo.ts`) reuses `obterEstadoHojeSomenteLeitura` +
  `obterProjecao(deps, {numCiclos:1})` for verba-livre/ritmo-diário before/after — does
  NOT reimplement the `*Fmt` pairs itself; the kernel's `comFmt` serializer adds those
  automatically to the whole response (any `*Cents` key, recursively), so impacto-ciclo
  only ever emits raw `*Cents` fields.
- `rotaEscrita`'s dryRun core (`transacao.ts`, `executarComPossivelDryRun`) takes an
  injected `transacionar` function specifically so it's unit-testable without Prisma —
  don't inline the sentinel-throw-and-catch logic directly in `rotas.ts` again if asked
  to touch this.
- `Deps` (`src/application/deps.ts`) grew three REQUIRED fields: `apiTokens`,
  `auditoria`, `idempotencia` — not optional, because (like `conversas`/`importacoes`)
  they're plain tables with no external extension dependency. The central test fixture
  `src/application/__fakes__/fakes-ciclo-fechamento.ts` has matching
  `FakeApiTokenRepo`/`FakeAuditoriaAgenteRepo`/`FakeIdempotenciaAgenteRepo` wired into its
  `criarDeps()` builder — update there, not per-test-file, if these ports change shape.

**Migration**: `prisma/migrations/20261104120000_agent_api/` — hand-written, applied +
resolved. Three new tables (`ApiToken`, `AuditoriaAgente`, `IdempotenciaAgente`), all
scoped by `donoId`, no existing table touched.

**Error codes** (`src/agent-api/erros.ts`, `mapearErroApi` — pure function): any `Error`
whose `.name` contains `"NaoEncontrado"` → 404 automatically (codebase-wide naming
convention, don't need to enumerate every such class). `CicloFechadoError` → 409
`CONFIRMACAO_NECESSARIA` with `ciclosAfetados` in details (mirrors the existing
`executarComConfirmacao` retroactive-edit flow in `src/actions/resultado-retroativo.ts`).

See [[migracoes-sem-migrate-dev]] for the hand-migration procedure this followed.
