import { describe, it, expect } from 'vitest';
import { gerarParcelas } from './parcelamento';
import { somaCents } from '@/shared/dinheiro';

describe('gerarParcelas (SPEC regra 4 / SPEC 9)', () => {
  it('999 em 3x -> 333 + 333 + 333', () => {
    const p = gerarParcelas({ valorTotalCents: 999, numParcelas: 3, dataCompra: '2026-07-10' });
    expect(p.map((x) => x.valorCents)).toEqual([333, 333, 333]);
  });

  it('1000 em 3x -> 333 + 333 + 334 (resto na última)', () => {
    const p = gerarParcelas({ valorTotalCents: 1000, numParcelas: 3, dataCompra: '2026-07-10' });
    expect(p.map((x) => x.valorCents)).toEqual([333, 333, 334]);
    expect(somaCents(p.map((x) => x.valorCents))).toBe(1000);
  });

  it('uma parcela por mês a partir da compra, com clamp de fim de mês', () => {
    const p = gerarParcelas({ valorTotalCents: 60000, numParcelas: 6, dataCompra: '2026-01-31' });
    expect(p.map((x) => x.data)).toEqual([
      '2026-01-31',
      '2026-02-28', // fevereiro não tem 31
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
    expect(p.map((x) => x.parcelaNum)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a soma das parcelas sempre bate com o total', () => {
    for (const total of [100, 999, 1000, 12345, 500000]) {
      for (const n of [1, 2, 3, 6, 12]) {
        const p = gerarParcelas({ valorTotalCents: total, numParcelas: n, dataCompra: '2026-07-10' });
        expect(somaCents(p.map((x) => x.valorCents))).toBe(total);
      }
    }
  });

  it('rejeita número de parcelas inválido', () => {
    expect(() => gerarParcelas({ valorTotalCents: 100, numParcelas: 0, dataCompra: '2026-07-10' })).toThrow();
  });
});
