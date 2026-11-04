import { describe, it, expect } from 'vitest';
import {
  snapshotMaisProximo,
  medirPoupancaReal,
  estimarPoupancaEmCurso,
  compararComMeta,
  mediaPoupancaReal,
  alertaLancamentosFaltando,
  alertaGastoVariavelBaixo,
} from './poupanca-real';

const snap = (data: string, totalCents: number) => ({ data, totalCents });
const base = [snap('2026-10-31', 25_000_000), snap('2026-11-29', 25_425_000)];
const ciclo = { dataInicio: '2026-11-01', dataFim: '2026-11-30' };

describe('snapshotMaisProximo', () => {
  it('empate de distância escolhe o mais antigo', () => {
    const r = snapshotMaisProximo([snap('2026-11-03', 2), snap('2026-10-30', 1)], '2026-11-01');
    expect(r?.data).toBe('2026-10-30');
  });
  it('fora da tolerância → null', () => {
    expect(snapshotMaisProximo([snap('2026-11-07', 1)], '2026-11-01')).toBeNull();
  });
});

describe('medirPoupancaReal', () => {
  it('mede por dois snapshots', () => {
    expect(
      medirPoupancaReal({ ...ciclo, snapshots: base, patrimonioFinalCicloAnteriorCents: null }),
    ).toEqual({
      status: 'MEDIDA',
      fonte: 'SNAPSHOT',
      inicialCents: 25_000_000,
      finalCents: 25_425_000,
      realCents: 425_000,
      dataInicial: '2026-10-31',
      dataFinal: '2026-11-29',
    });
  });
  it('snapshot inicial a 5 dias é usado', () => {
    const r = medirPoupancaReal({
      ...ciclo,
      snapshots: [snap('2026-11-06', 25_000_000), base[1]!],
      patrimonioFinalCicloAnteriorCents: null,
    });
    expect(r.status).toBe('MEDIDA');
  });
  it('a 6 dias sem fallback → SEM_INICIO com motivo', () => {
    const r = medirPoupancaReal({
      ...ciclo,
      snapshots: [snap('2026-11-07', 25_000_000), base[1]!],
      patrimonioFinalCicloAnteriorCents: null,
    });
    expect(r.status).toBe('SEM_INICIO');
    expect('motivo' in r && r.motivo).toBeTruthy();
  });
  it('a 6 dias com patrimônio do ciclo anterior → MEDIDA', () => {
    const r = medirPoupancaReal({
      ...ciclo,
      snapshots: [snap('2026-11-07', 25_000_000), base[1]!],
      patrimonioFinalCicloAnteriorCents: 24_900_000,
    });
    expect(r).toMatchObject({ status: 'MEDIDA', inicialCents: 24_900_000, dataInicial: null });
  });
  it('sem snapshot perto do fim → SEM_FIM', () => {
    const r = medirPoupancaReal({
      ...ciclo,
      snapshots: [base[0]!, snap('2026-12-06', 1)],
      patrimonioFinalCicloAnteriorCents: null,
    });
    expect(r.status).toBe('SEM_FIM');
  });
});

describe('estimarPoupancaEmCurso', () => {
  const p = { dataInicio: '2026-11-01', hoje: '2026-11-15', patrimonioFinalCicloAnteriorCents: null };
  it('sem snapshot no ciclo usa o efeito líquido das transações do ciclo no razão', () => {
    expect(
      estimarPoupancaEmCurso({ ...p, snapshots: [base[0]!], deltaLedgerCicloCents: 200_000 }),
    ).toEqual({ realCents: 200_000, fonte: 'SALDO_CONTAS', estimado: true });
  });
  it('D-13: snapshot inicial (realidade) acima do razão sem movimento no ciclo → 0, não a divergência', () => {
    // Reserva: snapshot R$ 60.000,00 vs razão R$ 49.550,32 — a diferença é conciliação, não poupança.
    expect(
      estimarPoupancaEmCurso({
        ...p,
        snapshots: [snap('2026-10-31', 6_000_000)],
        deltaLedgerCicloCents: 0,
      }),
    ).toEqual({ realCents: 0, fonte: 'SALDO_CONTAS', estimado: true });
  });
  it('com snapshot no ciclo usa o mais recente', () => {
    expect(
      estimarPoupancaEmCurso({
        ...p,
        snapshots: [base[0]!, snap('2026-11-14', 25_300_000)],
        deltaLedgerCicloCents: 1,
      }),
    ).toEqual({ realCents: 300_000, fonte: 'SNAPSHOT', estimado: true });
  });
  it('snapshot após hoje não conta', () => {
    expect(
      estimarPoupancaEmCurso({ ...p, snapshots: base, deltaLedgerCicloCents: 200_000 }),
    ).toMatchObject({ realCents: 200_000, fonte: 'SALDO_CONTAS' });
  });
  it('sem inicial, snapshot no ciclo não vale: cai no razão', () => {
    expect(
      estimarPoupancaEmCurso({ ...p, snapshots: [snap('2026-11-14', 9)], deltaLedgerCicloCents: 7 }),
    ).toEqual({ realCents: 7, fonte: 'SALDO_CONTAS', estimado: true });
  });
  it('nenhum dos dois calculável → null com motivo', () => {
    const r = estimarPoupancaEmCurso({ ...p, snapshots: [], deltaLedgerCicloCents: null });
    expect(r.realCents).toBeNull();
    expect('motivo' in r && r.motivo).toBeTruthy();
  });
});

describe('compararComMeta', () => {
  it('abaixo, acima e sem meta', () => {
    expect(compararComMeta(425_000, 1_800_000)).toEqual({ diferencaCents: -1_375_000, percentual: 23.6 });
    expect(compararComMeta(2_000_000, 1_800_000).percentual).toBe(111.1);
    expect(compararComMeta(1, 0).percentual).toBeNull();
  });
});

describe('mediaPoupancaReal', () => {
  const ciclos = [425_000, 600_000, 380_000, null, 500_000].map((poupancaRealCents) => ({ poupancaRealCents }));
  it('olha os n primeiros ignorando null', () => {
    expect(mediaPoupancaReal(ciclos, 3)).toEqual({ mediaCents: 468_333, ciclosConsiderados: 3 });
    expect(mediaPoupancaReal(ciclos, 6)).toEqual({ mediaCents: 476_250, ciclosConsiderados: 4 });
  });
  it('tudo null', () => {
    expect(mediaPoupancaReal([{ poupancaRealCents: null }], 3)).toEqual({ mediaCents: null, ciclosConsiderados: 0 });
  });
});

describe('alertaLancamentosFaltando', () => {
  const b = { rendaCents: 3_613_900, fixosCents: 488_400, despesasLancadasCents: 1_500_000, poupancaRealCents: 425_000 };
  it('dispara', () => {
    expect(alertaLancamentosFaltando(b)).toEqual({ semExplicacaoCents: 1_200_500, limiarCents: 180_695 });
  });
  it('não dispara abaixo do limiar', () => {
    expect(alertaLancamentosFaltando({ ...b, despesasLancadasCents: 2_000_000, poupancaRealCents: 1_100_000 })).toBeNull();
  });
  it('limiar mínimo R$ 1.000', () => {
    expect(alertaLancamentosFaltando({ ...b, rendaCents: 1_000_000, fixosCents: 0, despesasLancadasCents: 0, poupancaRealCents: 0 })?.limiarCents).toBe(100_000);
  });
});

describe('alertaGastoVariavelBaixo', () => {
  const ant = [2_000_000, 1_800_000, 2_200_000];
  it('dispara abaixo de 30% da média', () => {
    expect(alertaGastoVariavelBaixo({ gastoVariavelCents: 300_000, gastosAnterioresCents: ant })).toEqual({ mediaAnteriorCents: 2_000_000, percentual: 15 });
  });
  it('não dispara em 35% nem sem histórico', () => {
    expect(alertaGastoVariavelBaixo({ gastoVariavelCents: 700_000, gastosAnterioresCents: ant })).toBeNull();
    expect(alertaGastoVariavelBaixo({ gastoVariavelCents: 1, gastosAnterioresCents: [] })).toBeNull();
  });
});
