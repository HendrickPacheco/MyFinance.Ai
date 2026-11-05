import { describe, it, expect } from 'vitest';
import {
  formatBRL,
  parseBRL,
  ratearCents,
  somaCents,
  assertCentavos,
  formatUSD,
  formatTaxaBRL,
  converterParaBrlCents,
  formatarNumeroBRL,
  formatarRotuloGrafico,
  formatarReaisInteiros,
} from './dinheiro';

describe('formatBRL', () => {
  it('formata centavos como moeda BRL', () => {
    // Normaliza o espaço não-quebrável que o Intl insere após "R$".
    expect(formatBRL(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56');
    expect(formatBRL(0).replace(/ /g, ' ')).toBe('R$ 0,00');
    expect(formatBRL(5).replace(/ /g, ' ')).toBe('R$ 0,05');
  });

  it('rejeita valores não inteiros', () => {
    expect(() => formatBRL(10.5)).toThrow();
  });
});

describe('parseBRL', () => {
  it('converte entradas BR variadas em centavos', () => {
    expect(parseBRL('R$ 1.234,56')).toBe(123456);
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('1234,56')).toBe(123456);
    expect(parseBRL('50')).toBe(5000);
    expect(parseBRL('0,05')).toBe(5);
    expect(parseBRL('  12,00 ')).toBe(1200);
  });

  it('rejeita entradas inválidas', () => {
    expect(() => parseBRL('abc')).toThrow();
    expect(() => parseBRL('')).toThrow();
  });
});

describe('ratearCents (SPEC regra 11 — a soma das partes bate com o total)', () => {
  it('divide exato quando não há resto', () => {
    expect(ratearCents(999, 3)).toEqual([333, 333, 333]);
  });

  it('joga o resto na última parte', () => {
    expect(ratearCents(1000, 3)).toEqual([333, 333, 334]);
    expect(ratearCents(100, 3)).toEqual([33, 33, 34]);
  });

  it('a soma das partes é sempre igual ao total', () => {
    for (const total of [1, 7, 100, 999, 1000, 123457]) {
      for (const partes of [1, 2, 3, 5, 6, 12]) {
        const arr = ratearCents(total, partes);
        expect(arr).toHaveLength(partes);
        expect(somaCents(arr)).toBe(total);
      }
    }
  });

  it('rejeita partes inválidas', () => {
    expect(() => ratearCents(100, 0)).toThrow();
    expect(() => ratearCents(100, -1)).toThrow();
  });
});

describe('assertCentavos', () => {
  it('rejeita floats', () => {
    expect(() => assertCentavos(1.5)).toThrow();
  });
  it('aceita inteiros', () => {
    expect(assertCentavos(0)).toBe(0);
    expect(assertCentavos(-100)).toBe(-100);
  });
});

describe('formatarNumeroBRL', () => {
  it('omite ,00 quando redondo e mantém centavos quando não', () => {
    expect(formatarNumeroBRL(287900)).toBe('2.879');
    expect(formatarNumeroBRL(0)).toBe('0');
    expect(formatarNumeroBRL(91755)).toBe('917,55');
    expect(formatarNumeroBRL(-8300)).toBe('-83');
  });
});

describe('formatarRotuloGrafico', () => {
  it('inteiro abaixo de 10 mil, compacto acima, completo no último', () => {
    expect(formatarRotuloGrafico(537_900)).toBe('5.379');
    expect(formatarRotuloGrafico(1_060_000)).toBe('10,6k');
    expect(formatarRotuloGrafico(1_130_000, true)).toBe('11.300');
  });
});

describe('formatUSD / formatTaxaBRL / converterParaBrlCents', () => {
  const n = (s: string) => s.replace(/\u00a0/g, ' ');
  it('formatUSD', () => {
    expect(n(formatUSD(730_000))).toBe('US$ 7.300,00');
  });
  it('formatTaxaBRL: mín. 2, máx. 4 casas', () => {
    expect(n(formatTaxaBRL(5_430_000))).toBe('R$ 5,43');
    expect(n(formatTaxaBRL(5_430_600))).toBe('R$ 5,4306');
    expect(n(formatTaxaBRL(5_430_500))).toBe('R$ 5,4305');
  });
  it('converterParaBrlCents faz floor e protege overflow', () => {
    expect(converterParaBrlCents(730_000, 5_430_000)).toBe(3_963_900);
    expect(converterParaBrlCents(1, 5_430_000)).toBe(5);
    expect(() => converterParaBrlCents(Number.MAX_SAFE_INTEGER, 5_430_000)).toThrow(RangeError);
  });
});

describe('parseTaxaMicros', () => {
  it('converte sem deriva de float e rejeita >6 casas', async () => {
    const { parseTaxaMicros } = await import('./dinheiro');
    expect(parseTaxaMicros('5,43')).toBe(5_430_000);
    expect(parseTaxaMicros('5.4306')).toBe(5_430_600);
    expect(parseTaxaMicros('4,35')).toBe(4_350_000);
    expect(() => parseTaxaMicros('5,1234567')).toThrow();
    expect(() => parseTaxaMicros('abc')).toThrow();
  });
});

describe('formatarReaisInteiros', () => {
  it('arredonda half-up para reais inteiros', () => {
    expect(formatarReaisInteiros(8349)).toBe('83');
    expect(formatarReaisInteiros(8350)).toBe('84');
    expect(formatarReaisInteiros(287_900)).toBe('2.879');
    expect(formatarReaisInteiros(0)).toBe('0');
  });
});
