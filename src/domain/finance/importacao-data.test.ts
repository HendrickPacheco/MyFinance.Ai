import { describe, it, expect } from 'vitest';
import { resolverAnoDaFatura, lerDiaMes } from './importacao-data';

describe('resolverAnoDaFatura (TASKS-IMPORTACAO §10)', () => {
  it('virada de dezembro: fatura de competência 2027-01, linha "12/12" resolve para 2026-12-12', () => {
    const resultado = resolverAnoDaFatura({
      diaMes: { dia: 12, mes: 12 },
      competenciaRef: '2027-01',
    });
    expect(resultado).toEqual({ data: '2026-12-12' });
  });

  it('não confunde dia com mês: 31/01 e 01/02 na mesma competência resolvem para datas distintas', () => {
    const resultado31Jan = resolverAnoDaFatura({
      diaMes: { dia: 31, mes: 1 },
      competenciaRef: '2026-02',
    });
    const resultado01Fev = resolverAnoDaFatura({
      diaMes: { dia: 1, mes: 2 },
      competenciaRef: '2026-02',
    });
    expect(resultado31Jan).toEqual({ data: '2026-01-31' });
    expect(resultado01Fev).toEqual({ data: '2026-02-01' });
  });

  it('29/02 em ano bissexto (2028) resolve normalmente', () => {
    const resultado = resolverAnoDaFatura({
      diaMes: { dia: 29, mes: 2 },
      competenciaRef: '2028-03',
    });
    expect(resultado).toEqual({ data: '2028-02-29' });
  });

  it('29/02 quando nenhum dos dois anos candidatos é bissexto -> ambígua com motivo', () => {
    const resultado = resolverAnoDaFatura({
      diaMes: { dia: 29, mes: 2 },
      competenciaRef: '2027-03', // candidatos: 2027 e 2026, nenhum bissexto
    });
    expect(resultado).toMatchObject({ ambigua: true });
    if ('ambigua' in resultado) {
      expect(resultado.motivo).toMatch(/29/);
      expect(resultado.motivo.length).toBeGreaterThan(0);
    }
  });

  it('linha do próprio mês da competência resolve para o ano da competência', () => {
    const resultado = resolverAnoDaFatura({
      diaMes: { dia: 15, mes: 8 },
      competenciaRef: '2026-08',
    });
    expect(resultado).toEqual({ data: '2026-08-15' });
  });

  it('linha mais de 3 meses antes da competência cai fora da janela -> ambígua com motivo', () => {
    const resultado = resolverAnoDaFatura({
      diaMes: { dia: 1, mes: 3 }, // competência é agosto: março é 5 meses antes
      competenciaRef: '2026-08',
    });
    expect(resultado).toMatchObject({ ambigua: true });
    if ('ambigua' in resultado) {
      expect(resultado.motivo).toMatch(/janela/);
    }
  });

  it('mês fora de 1..12 -> ambígua com motivo, nunca lança exceção', () => {
    const resultado = resolverAnoDaFatura({
      diaMes: { dia: 10, mes: 13 },
      competenciaRef: '2026-08',
    });
    expect(resultado).toMatchObject({ ambigua: true });
    if ('ambigua' in resultado) {
      expect(resultado.motivo).toMatch(/mês/);
    }
  });

  it('dia inexistente em qualquer um dos dois anos candidatos (31/04) -> ambígua com motivo', () => {
    const resultado = resolverAnoDaFatura({
      diaMes: { dia: 31, mes: 4 }, // abril nunca tem dia 31, em nenhum ano
      competenciaRef: '2026-05',
    });
    expect(resultado).toMatchObject({ ambigua: true });
    if ('ambigua' in resultado) {
      expect(resultado.motivo).toMatch(/dia 31/);
    }
  });

  it('rejeita competenciaRef fora do formato YYYY-MM', () => {
    expect(() =>
      resolverAnoDaFatura({ diaMes: { dia: 1, mes: 1 }, competenciaRef: '2026/08' }),
    ).toThrow(TypeError);
  });
});

describe('lerDiaMes', () => {
  it('lê formato "DD/MM"', () => {
    expect(lerDiaMes('12/03')).toEqual({ dia: 12, mes: 3 });
  });

  it('lê formato "DD MMM" maiúsculo', () => {
    expect(lerDiaMes('12 MAR')).toEqual({ dia: 12, mes: 3 });
  });

  it('lê formato "DD MMM" minúsculo', () => {
    expect(lerDiaMes('12 mar')).toEqual({ dia: 12, mes: 3 });
  });

  it('devolve null para texto ilegível', () => {
    expect(lerDiaMes('COMPRA ESTABELECIMENTO XYZ')).toBeNull();
    expect(lerDiaMes('')).toBeNull();
  });

  it('devolve null para mês abreviado que não existe', () => {
    expect(lerDiaMes('12 xyz')).toBeNull();
  });
});
