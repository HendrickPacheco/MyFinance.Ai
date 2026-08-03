import { describe, it, expect } from 'vitest';
import {
  provisaoMensalCents,
  poupancaAlvoCents,
  verbaVariavelCents,
  distribuirProvisaoMensalCents,
} from './verba';

describe('provisaoMensalCents', () => {
  it('é zero quando não há provisões', () => {
    expect(provisaoMensalCents([])).toBe(0);
  });

  it('divide a soma anual por 12 com floor', () => {
    // 1200,00/ano -> 100,00/mês
    expect(provisaoMensalCents([120000])).toBe(10000);
    // 100,00/ano -> floor(10000/12) = 833
    expect(provisaoMensalCents([10000])).toBe(833);
    // várias provisões somadas
    expect(provisaoMensalCents([120000, 60000, 12000])).toBe(Math.floor(192000 / 12));
  });
});

describe('distribuirProvisaoMensalCents (SPEC regra 11 — soma das partes bate com o total)', () => {
  it('sem provisões devolve lista vazia', () => {
    expect(distribuirProvisaoMensalCents([])).toEqual([]);
  });

  it('quando os floors individuais já batem com o floor do total, distribui sem sobra', () => {
    // floor(120000/12)=10000, floor(60000/12)=5000, soma=15000=floor(180000/12)
    expect(distribuirProvisaoMensalCents([120000, 60000])).toEqual([10000, 5000]);
  });

  it('duas provisões de 1100 centavos: soma creditada bate com o total reservado na verba', () => {
    // floor(1100/12)=91 cada -> soma 182, mas floor(2200/12)=183: falta 1 centavo.
    const partes = distribuirProvisaoMensalCents([1100, 1100]);
    expect(partes.reduce((s, v) => s + v, 0)).toBe(provisaoMensalCents([1100, 1100]));
    expect(partes.reduce((s, v) => s + v, 0)).toBe(183);
  });

  it('a soma das partes é sempre igual ao total reservado, com N provisões arbitrário', () => {
    const valores = [1100, 1100, 1100, 250, 999];
    const partes = distribuirProvisaoMensalCents(valores);
    expect(partes).toHaveLength(valores.length);
    expect(partes.reduce((s, v) => s + v, 0)).toBe(provisaoMensalCents(valores));
    expect(partes.every((v) => Number.isInteger(v))).toBe(true);
  });
});

describe('poupancaAlvoCents', () => {
  it('usa o valor absoluto quando não há percentual', () => {
    expect(
      poupancaAlvoCents({ rendaPrevistaCents: 500000, metaPoupancaCents: 100000 }),
    ).toBe(100000);
  });

  it('percentual tem precedência e incide sobre a renda do mês (item 2)', () => {
    // 20% de 5000,00 = 1000,00
    expect(
      poupancaAlvoCents({
        rendaPrevistaCents: 500000,
        metaPoupancaCents: 100000,
        metaPoupancaPercent: 20,
      }),
    ).toBe(100000);
    // 15% de 5000,00 = 750,00
    expect(
      poupancaAlvoCents({
        rendaPrevistaCents: 500000,
        metaPoupancaCents: 0,
        metaPoupancaPercent: 15,
      }),
    ).toBe(75000);
  });
});

describe('verbaVariavelCents (SPEC 9 — provisão zero e provisão preenchida)', () => {
  it('renda − poupança − fixos − provisão, com provisão ZERO', () => {
    // 5000 − 1000 − 2000 − 0 = 2000,00
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        poupancaAlvoCents: 100000,
        fixosCents: 200000,
        provisaoMensalCents: 0,
      }),
    ).toBe(200000);
  });

  it('com provisão PREENCHIDA a verba cai exatamente pela provisão', () => {
    // 5000 − 1000 − 2000 − 500 = 1500,00
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        poupancaAlvoCents: 100000,
        fixosCents: 200000,
        provisaoMensalCents: 50000,
      }),
    ).toBe(150000);
  });

  it('soma o rollover herdado (item 5), inclusive negativo', () => {
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        poupancaAlvoCents: 100000,
        fixosCents: 200000,
        provisaoMensalCents: 0,
        rolloverRecebidoCents: 30000,
      }),
    ).toBe(230000);
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        poupancaAlvoCents: 100000,
        fixosCents: 200000,
        provisaoMensalCents: 0,
        rolloverRecebidoCents: -50000,
      }),
    ).toBe(150000);
  });

  it('pode ser negativa (renda insuficiente) — tratamento fica com o modo recuperação', () => {
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 100000,
        poupancaAlvoCents: 50000,
        fixosCents: 80000,
        provisaoMensalCents: 0,
      }),
    ).toBe(-30000);
  });
});
