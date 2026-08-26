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

  describe('parcelaInicial (importação de compra parcelada parcialmente conhecida — D-17c)', () => {
    it('importar "3/12" de compra em R$ 300 total (10 parcelas) gera parcelaNum 3..12', () => {
      const p = gerarParcelas({
        valorTotalCents: 300,
        numParcelas: 12,
        dataCompra: '2026-01-10',
        parcelaInicial: 3,
      });

      expect(p).toHaveLength(10);
      expect(p.map((x) => x.parcelaNum)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(somaCents(p.map((x) => x.valorCents))).toBe(300);
    });

    it('nenhuma parcela gerada tem competência anterior à da parcela inicial', () => {
      const p = gerarParcelas({
        valorTotalCents: 1000,
        numParcelas: 12,
        dataCompra: '2026-01-10',
        parcelaInicial: 3,
      });

      const dataDaTerceira = '2026-03-10';
      expect(p[0]?.data).toBe(dataDaTerceira);
      for (const parcela of p) {
        expect(parcela.data >= dataDaTerceira).toBe(true);
      }
    });

    it('a soma das parcelas geradas sempre bate com valorTotalCents, variando total e parcelaInicial', () => {
      for (const total of [100, 999, 1000, 12345, 500000]) {
        for (const numParcelas of [3, 6, 12]) {
          for (let parcelaInicial = 1; parcelaInicial <= numParcelas; parcelaInicial++) {
            const p = gerarParcelas({
              valorTotalCents: total,
              numParcelas,
              dataCompra: '2026-07-10',
              parcelaInicial,
            });
            expect(somaCents(p.map((x) => x.valorCents))).toBe(total);
          }
        }
      }
    });

    it('1000 em 3 partes restantes (parcelaInicial no meio) manda o resto para a última gerada', () => {
      const p = gerarParcelas({
        valorTotalCents: 1000,
        numParcelas: 5,
        dataCompra: '2026-07-10',
        parcelaInicial: 3,
      });
      expect(p.map((x) => x.valorCents)).toEqual([333, 333, 334]);
      expect(p.map((x) => x.parcelaNum)).toEqual([3, 4, 5]);
    });

    it('parcelaInicial === numParcelas gera uma única parcela com o total inteiro', () => {
      const p = gerarParcelas({
        valorTotalCents: 500,
        numParcelas: 12,
        dataCompra: '2026-01-10',
        parcelaInicial: 12,
      });

      expect(p).toHaveLength(1);
      expect(p[0]).toEqual({ parcelaNum: 12, data: '2026-12-10', valorCents: 500 });
    });

    it('clamp de fim de mês continua valendo com parcelaInicial deslocado', () => {
      const p = gerarParcelas({
        valorTotalCents: 200,
        numParcelas: 3,
        dataCompra: '2026-01-31',
        parcelaInicial: 2,
      });

      expect(p.map((x) => x.data)).toEqual(['2026-02-28', '2026-03-31']);
      expect(p.map((x) => x.parcelaNum)).toEqual([2, 3]);
    });

    it.each([0, -1, 1.5, 13])('rejeita parcelaInicial inválido: %s', (parcelaInicial) => {
      expect(() =>
        gerarParcelas({
          valorTotalCents: 1200,
          numParcelas: 12,
          dataCompra: '2026-01-10',
          parcelaInicial,
        }),
      ).toThrow(RangeError);
    });
  });
});
