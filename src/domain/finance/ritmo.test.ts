import { describe, it, expect } from 'vitest';
import { indicadoresRitmo } from './ritmo';

describe('indicadoresRitmo (SPEC 5.3)', () => {
  // Ciclo 05/07 a 04/08 (31 dias), verba R$ 3.100,00 -> teto inicial 100,00/dia.
  const base = { verbaVariavelCents: 310000, dataInicio: '2026-07-05', dataFim: '2026-08-04' };

  it('no ritmo: gastando a média igual ao teto inicial, ritmo ~= 1', () => {
    // 10 dias decorridos, gastou 1000,00 -> média 100,00/dia.
    const r = indicadoresRitmo({ ...base, hoje: '2026-07-14', gastoRealizadoCents: 100000 });
    expect(r.diasTotaisCiclo).toBe(31);
    expect(r.diasDecorridos).toBe(10);
    expect(r.mediaDiariaRealCents).toBe(10000);
    expect(r.tetoInicialCents).toBeCloseTo(310000 / 31, 5);
    expect(r.ritmo).toBeCloseTo(1, 5);
  });

  it('acima do sustentável: ritmo > 1 quando gasta mais que o teto inicial', () => {
    // 5 dias, gastou 1000,00 -> média 200,00/dia (o dobro do teto inicial).
    const r = indicadoresRitmo({ ...base, hoje: '2026-07-09', gastoRealizadoCents: 100000 });
    expect(r.diasDecorridos).toBe(5);
    expect(r.mediaDiariaRealCents).toBe(20000);
    expect(r.ritmo).toBeGreaterThan(1);
    // projeção de fechamento estoura a verba
    expect(r.projecaoFechamentoCents).toBeGreaterThan(310000);
  });
});
