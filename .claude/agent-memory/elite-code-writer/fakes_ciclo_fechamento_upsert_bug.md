---
name: fakes-ciclo-fechamento-upsert-bug
description: FakeCustoFixoRepo/FakeProvisaoRepo.salvar were append-only (no upsert-by-id) before 10/08/2026 — fixed, but check other Fake*Repo.salvar methods in fakes-ciclo-fechamento.ts for the same bug before trusting them.
type: project
---

`src/application/__fakes__/fakes-ciclo-fechamento.ts` — `FakeCustoFixoRepo.salvar` and
`FakeProvisaoRepo.salvar` used to `this.itens.push(clone(x))` unconditionally, never
checking whether `x.id` already existed in `this.itens`. Any caso de uso that read an
entity, mutated a field, and called `.salvar(...)` on it (e.g. `desativarCustoFixo`
doing `salvar({ ...atual, ativo: false })`) silently produced a DUPLICATE row instead
of updating in place — `listarTodos()` returned both the old and the "updated" row.

**Why this stayed hidden:** every existing caller of `upsertCustoFixo`/`upsertProvisao`
in the test suite passed `id: ''` (always a create), so the update path was never
exercised until Fase 4 of TASKS-CUSTOS added `desativarCustoFixo`/`desativarProvisao`
(edit-in-place). `FakeContaRepo.salvar` already did the correct
`findIndex` → replace-or-push pattern; `FakeCustoFixoRepo`/`FakeProvisaoRepo` just
hadn't been brought up to the same standard.

**Fixed 10/08/2026** to `findIndex((c) => c.id === custo.id)` → replace in place or
push if absent, mirroring `FakeContaRepo.salvar`.

**How to apply:** if a future caso de uso calls `.salvar()` on `custosFixos` or
`provisoes` with an existing id and a test shows a phantom duplicate row (`listarTodos`
length off by one, or `listarAtivos`/`listarTodas` disagreeing in a way that implies
two rows for one id), this is the class of bug to suspect first — check whether the
relevant `Fake*Repo.salvar` in `fakes-ciclo-fechamento.ts` actually does an upsert
rather than an append. `FakeParcelamentoRepo` and `FakeCicloRepo` already do it
correctly (`atualizar` is a separate method from `criar`), so the risk is specific to
repos whose port only exposes a single `salvar(entity)` upsert method.
