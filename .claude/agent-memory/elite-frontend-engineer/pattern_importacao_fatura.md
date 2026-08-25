---
name: pattern_importacao_fatura
description: How the invoice-import chat attach flow and per-line review card work (I3, TASKS-IMPORTACAO.md §15).
metadata:
  type: project
---

Built 2026-08-25: chat-based invoice (fatura) import, client side of I3
(`TASKS-IMPORTACAO.md` §15.1/§15.7). Server (`app/api/importacao/route.ts`,
`src/actions/importacao.ts`, `src/application/importacao/*`,
`src/application/ia/ferramentas/importacao.ts`) was already complete.

**Key insight that shaped the design**: the copiloto's tool catalog already
had `conciliar_importacao`/`propor_importacao` (`ferramentas/catalogo.ts`),
which produce a normal `resposta.propostas` entry with
`tipo: 'IMPORTACAO'` (`propostaImportacaoSchema` in
`application/ia/propostas.ts`). So the attach flow does NOT invent a new UI
turn kind for the review — it uploads/extracts directly (bypassing the AI
loop, since extraction is pure OCR+conciliation, no reasoning needed and
costs ~40s), then sends a short synthetic user message like "Anexei a
fatura... Id da importação: X" through the EXISTING `perguntarCopiloto` path.
The model reads that, calls the two tools, and the review card renders
through the same `resposta.propostas` pipeline as any other proposal —
just with a type-specific card swapped in.

**Files added**:
- `src/components/ia/anexar-fatura.tsx` — the attach control (PDF file input
  or paste-text, `<Input type="month">` for `competenciaRef` — native month
  picker avoids any `Date` parsing for the YYYY-MM string). Calls
  `fetch('/api/importacao', ...)` directly for PDF (client can't call a
  Route Handler via a typed server-action import) or
  `colarTextoImportacaoAction` for pasted text. On success, bubbles
  `ResultadoImportacaoConciliada` up via `onExtraido`.
- `src/components/ia/cartao-importacao.tsx` — the per-faixa review card.
  Renders `JA_REGISTRADO`/`CUSTO_FIXO_RECONHECIDO`/`IGNORADO` as collapsed
  `<details>` with a bulk "resolve all pending" button (native, keyboard
  operable, no JS toggle state needed), and `NOVO`/`PRECISA_DE_VOCE` as
  always-visible one-line-at-a-time cards with confirm/discard buttons
  (motivo text shown only for `PRECISA_DE_VOCE`).
- `src/components/ia/copiloto-chat.tsx` — `Turno` became a discriminated
  union (`PERGUNTA` | `AVISO`). `AVISO` is a **local-only** turn (never hits
  the AI loop) used for the `JA_CONFIRMADA` upload result — showing "esta
  fatura já foi importada" doesn't need a model call, and the codebase is
  very cost-conscious about AI turns (see docblock of `actions/ia.ts`).
- `src/components/ia/resposta-com-proveniencia.tsx` — both the live
  (`CartaoDaPropostaViva`) and historic (`CartaoDaPropostaHistorica`)
  proposal renderers now branch on `proposta.tipo === 'IMPORTACAO'` to
  render `CartaoImportacao` instead of `CartaoProposta`/`CartaoPropostaInerte`.
  The historic path re-validates the persisted `Record<string, unknown>`
  against `propostaImportacaoSchema` (persistence never revalidates on
  write — see `montarProveniencia` in `actions/ia.ts`) before trusting it.

**The "reopened conversation" decision (§15.3 precedent, `cartao-proposta-inerte.tsx`)**:
Chose NOT to build a separate inert variant for the import card — it stays
the *same* interactive `CartaoImportacao` component whether live or
reopened from history. Reasoning (written as a docblock in
`cartao-importacao.tsx`): unlike LANÇAMENTO/PARCELAMENTO/MEMÓRIA (which have
no way to know if a past proposal was already executed, so re-clicking would
double-write), each import line has its own persisted identity
(`ItemImportado.id`) and `confirmarItemImportado`
(`application/importacao/confirmar.ts`) is *already* idempotent by
construction — re-confirming a resolved line returns `{ status:
'JA_PROCESSADA', decisaoAnterior }` instead of writing again, and a race is
caught by the DB unique constraint (`ItemImportadoJaGravadoError`) and
treated as success. The UI surfaces `JA_PROCESSADA` as information ("já
resolvida antes"), never as an error. This is a structurally different
safety story from the other proposal types, and is why `CartaoImportacao`
skips the inert-card pattern entirely.

**Known gaps / left for later** (flagged, not built — kept scope contained):
- No inline editor for `AjustesConfirmacao` (categoriaId/data/contaId) or
  `EscolhaAmbigua` on `PRECISA_DE_VOCE` lines — confirming a line that
  actually needs an adjustment (no resolvable date, `AMBIGUA` veredito) will
  surface the server's error message inline but the dono currently has no
  way to *supply* the missing piece from this card. Would need a small
  category/date picker per line, wired through `confirmarItemImportadoAction`'s
  existing `ajustes`/`escolhaAmbigua` params (server already accepts them).
- `CUSTO_FIXO_RECONHECIDO` display names come from `item.descricaoOriginal`
  (the fatura's own text), not the registered `CustoFixo.nome` — there's no
  existing client-callable action that returns custo-fixo names, and this
  task's boundary excluded touching `src/actions/`.

See also [[ui_primitives]], [[design_system]], [[pattern_pago_toggle]].
