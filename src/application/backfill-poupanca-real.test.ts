import { describe, it, expect } from 'vitest';
import { backfillPoupancaReal } from './backfill-poupanca-real';
import { criarDeps, cicloFake } from './__fakes__/fakes-ciclo-fechamento';
import type { SnapshotPatrimonio } from '@/domain/model/entidades';

const snap = (data: string, totalCents: number): SnapshotPatrimonio => ({ id: `s-${data}`, data, totalCents, itens: [] });
const fechado = (id: string, ini: string, fim: string) =>
  cicloFake({ id, dataInicio: ini, dataFim: fim, fechado: true });

const SNAPS = [
  snap('2026-08-31', 24_000_000),
  snap('2026-09-30', 24_500_000),
  snap('2026-10-31', 25_000_000),
  snap('2026-11-29', 25_425_000),
];
const CICLOS = () => [
  fechado('nov', '2026-11-01', '2026-11-30'),
  fechado('set', '2026-09-01', '2026-09-30'),
  fechado('out', '2026-10-01', '2026-10-31'),
];

describe('backfillPoupancaReal', () => {
  it('mede do mais antigo ao mais novo e grava com aplicar', async () => {
    const deps = criarDeps({ hoje: '2026-12-01', ciclos: CICLOS(), snapshots: SNAPS });
    const r = await backfillPoupancaReal(deps, { aplicar: true });
    expect(r.map((l) => [l.cicloId, l.status, l.realCents])).toEqual([
      ['set', 'MEDIDA', 500_000],
      ['out', 'MEDIDA', 500_000],
      ['nov', 'MEDIDA', 425_000],
    ]);
    const nov = deps.ciclos.itens.find((c) => c.id === 'nov')!;
    expect(nov).toMatchObject({
      poupancaRealCents: 425_000,
      patrimonioInicialCents: 25_000_000,
      patrimonioFinalCents: 25_425_000,
      fonteMedicaoPoupanca: 'SNAPSHOT',
    });
  });

  it('dry-run não grava, mas devolve os valores', async () => {
    const deps = criarDeps({ hoje: '2026-12-01', ciclos: CICLOS(), snapshots: SNAPS });
    const r = await backfillPoupancaReal(deps, { aplicar: false });
    expect(r.every((l) => l.status === 'MEDIDA')).toBe(true);
    expect(deps.ciclos.itens.every((c) => c.poupancaRealCents === null)).toBe(true);
  });

  it('ciclo já preenchido fica JA_TINHA e intacto', async () => {
    const ciclos = CICLOS();
    ciclos[2] = cicloFake({ id: 'out', dataInicio: '2026-10-01', dataFim: '2026-10-31', fechado: true, poupancaRealCents: 7, patrimonioFinalCents: 25_000_000 });
    const deps = criarDeps({ hoje: '2026-12-01', ciclos, snapshots: SNAPS });
    const r = await backfillPoupancaReal(deps, { aplicar: true });
    expect(r.find((l) => l.cicloId === 'out')).toMatchObject({ status: 'JA_TINHA', realCents: 7 });
    expect(deps.ciclos.itens.find((c) => c.id === 'out')!.poupancaRealCents).toBe(7);
  });

  it('sem snapshot no fim: SEM_FIM e nada gravado', async () => {
    const deps = criarDeps({ hoje: '2026-12-01', ciclos: [fechado('set', '2026-09-01', '2026-09-30')], snapshots: [snap('2026-08-31', 24_000_000)] });
    const r = await backfillPoupancaReal(deps, { aplicar: true });
    expect(r[0]).toMatchObject({ status: 'SEM_FIM', realCents: null });
    expect(deps.ciclos.itens[0]!.poupancaRealCents).toBeNull();
  });
});
