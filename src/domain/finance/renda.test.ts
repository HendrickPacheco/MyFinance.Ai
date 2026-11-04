import { describe, it, expect } from 'vitest';
import { calcularImpostoCents, rendaLiquidaPrevista, aplicarNovaRendaAoCiclo } from './renda';

const n = (s: string) => s.replace(/\u00a0/g, ' ');
const usd = {
  moedaRenda: 'USD' as const,
  rendaBaseCents: 3_000_000,
  rendaBrutaMoedaOrigemCents: 730_000,
  impostoEstimadoCents: 350_000,
  impostoEstimadoPercentual: null,
};
const cot = { data: '2026-11-03', taxaMicros: 5_430_000 };

describe('calcularImpostoCents', () => {
  it('fixo, percentual, ambos, nenhum', () => {
    const b = 3_963_900;
    expect(calcularImpostoCents({ brutaBrlCents: b, impostoEstimadoCents: 350_000, impostoEstimadoPercentual: null })).toBe(350_000);
    expect(calcularImpostoCents({ brutaBrlCents: b, impostoEstimadoCents: null, impostoEstimadoPercentual: 10 })).toBe(396_390);
    expect(() => calcularImpostoCents({ brutaBrlCents: b, impostoEstimadoCents: 350_000, impostoEstimadoPercentual: 10 })).toThrow(RangeError);
    expect(calcularImpostoCents({ brutaBrlCents: b, impostoEstimadoCents: null, impostoEstimadoPercentual: null })).toBe(0);
  });
});

describe('rendaLiquidaPrevista', () => {
  it('USD com imposto fixo', () => {
    const r = rendaLiquidaPrevista(usd, cot);
    expect(r.liquidaCents).toBe(3_613_900);
    expect(r.brutaBrlCents).toBe(3_963_900);
    expect(r.impostoCents).toBe(350_000);
    expect(n(r.decomposicao)).toBe('US$ 7.300,00 × R$ 5,43 = R$ 39.639,00 − imposto R$ 3.500,00 = R$ 36.139,00');
    expect(r.motivoSemCotacao).toBeNull();
  });
  it('USD com imposto 10%', () => {
    expect(rendaLiquidaPrevista({ ...usd, impostoEstimadoCents: null, impostoEstimadoPercentual: 10 }, cot).liquidaCents).toBe(3_567_510);
  });
  it('USD sem cotação cai na renda base', () => {
    const r = rendaLiquidaPrevista(usd, null);
    expect(r.liquidaCents).toBe(3_000_000);
    expect(r.motivoSemCotacao).toContain('Sem cotação');
  });
  it('BRL', () => {
    const r = rendaLiquidaPrevista({ ...usd, moedaRenda: 'BRL' }, null);
    expect(r.liquidaCents).toBe(3_000_000);
    expect(r.taxaMicros).toBeNull();
    expect(n(r.decomposicao)).toBe('R$ 30.000,00 (renda líquida em reais)');
  });
});

describe('aplicarNovaRendaAoCiclo', () => {
  const base = { verbaVariavelCents: 2_511_600, rendaPrevistaCents: 3_000_000, rendaRealLiquidaCents: null, poupancaAlvoCents: 1_800_000 };
  it('delta preserva rollover e meta', () => {
    expect(aplicarNovaRendaAoCiclo(base, 3_613_900, null)).toEqual({ verbaVariavelCents: 3_125_500, poupancaAlvoCents: 1_800_000 });
    expect(aplicarNovaRendaAoCiclo({ ...base, verbaVariavelCents: 2_561_600 }, 3_613_900, null).verbaVariavelCents).toBe(3_175_500);
  });
  it('meta percentual', () => {
    expect(aplicarNovaRendaAoCiclo(base, 3_613_900, 50).poupancaAlvoCents).toBe(1_806_950);
  });
  it('parte da renda real quando já existe', () => {
    expect(aplicarNovaRendaAoCiclo({ ...base, verbaVariavelCents: 3_125_500, rendaRealLiquidaCents: 3_613_900 }, 3_500_000, null).verbaVariavelCents).toBe(3_125_500 - 113_900);
  });
});
