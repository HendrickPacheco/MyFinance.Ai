import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/shared/dinheiro';
import { comFmt } from './formatacao';

describe('comFmt', () => {
  it('adiciona o par Fmt para um campo Cents de nível raiz', () => {
    expect(comFmt({ tetoHojeCents: 8300 })).toEqual({
      tetoHojeCents: 8300,
      tetoHojeFmt: formatBRL(8300),
    });
  });

  it('é recursivo em objetos aninhados', () => {
    expect(comFmt({ impactoCiclo: { verbaLivreAntesCents: 100 } })).toEqual({
      impactoCiclo: { verbaLivreAntesCents: 100, verbaLivreAntesFmt: formatBRL(100) },
    });
  });

  it('é recursivo em arrays de objetos', () => {
    expect(comFmt({ itens: [{ valorCents: 500 }, { valorCents: -200 }] })).toEqual({
      itens: [
        { valorCents: 500, valorFmt: formatBRL(500) },
        { valorCents: -200, valorFmt: formatBRL(-200) },
      ],
    });
  });

  it('ignora campo que termina em Cents mas não é number (nunca formata string/null)', () => {
    expect(comFmt({ idCents: 'abc', nuloCents: null })).toEqual({ idCents: 'abc', nuloCents: null });
  });

  it('não formata número não-inteiro em campo Cents (dinheiro nunca é float, mas o serializer não assume)', () => {
    expect(comFmt({ mediaCents: 10.5 })).toEqual({ mediaCents: 10.5 });
  });

  it('preserva Date sem reduzi-la a objeto vazio', () => {
    const data = new Date('2026-11-04T00:00:00Z');
    expect(comFmt({ criadoEm: data })).toEqual({ criadoEm: data });
  });

  it('preserva null, undefined e primitivos', () => {
    expect(comFmt({ a: null, b: undefined, c: 'texto', d: 42 })).toEqual({
      a: null,
      b: undefined,
      c: 'texto',
      d: 42,
    });
  });

  it('passa arrays no nível raiz', () => {
    expect(comFmt([{ saldoCents: 0 }])).toEqual([{ saldoCents: 0, saldoFmt: formatBRL(0) }]);
  });
});
