import { describe, it, expect } from 'vitest';
import {
  provisaoMensalCents,
  poupancaAlvoCents,
  verbaVariavelCents,
  distribuirProvisaoMensalCents,
  fixosVigentesNoCicloCents,
  type CustoComVigencia,
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
  it('renda − fixos − provisão, com provisão ZERO', () => {
    // 5000 − 2000 − 0 = 3000,00
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        fixosCents: 200000,
        provisaoMensalCents: 0,
      }),
    ).toBe(300000);
  });

  it('com provisão PREENCHIDA a verba cai exatamente pela provisão', () => {
    // 5000 − 2000 − 500 = 2500,00
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        fixosCents: 200000,
        provisaoMensalCents: 50000,
      }),
    ).toBe(250000);
  });

  it('soma o rollover herdado (item 5), inclusive negativo', () => {
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        fixosCents: 200000,
        provisaoMensalCents: 0,
        rolloverRecebidoCents: 30000,
      }),
    ).toBe(330000);
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        fixosCents: 200000,
        provisaoMensalCents: 0,
        rolloverRecebidoCents: -50000,
      }),
    ).toBe(250000);
  });

  it('pode ser negativa (renda insuficiente) — tratamento fica com o modo recuperação', () => {
    // Agora só os fixos derrubam a verba: 1000 − 1300 = −300,00.
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 100000,
        fixosCents: 130000,
        provisaoMensalCents: 0,
      }),
    ).toBe(-30000);
  });
});

describe('verbaVariavelCents — a meta de poupança NÃO é descontada (D-16, 14/09/2026)', () => {
  // Este bloco substitui o teste que provava o contrário. A meta continua
  // existindo (`poupancaAlvoCents`), mas como OBJETIVO: quem voltar a subtraí-la
  // dentro da verba transforma alvo em gasto certo e derruba o teto diário de
  // um mês em que o dono nunca decidiu poupar. O guarda tem que continuar aqui.
  it('a verba é a mesma por qualquer meta — a meta não entra na conta', () => {
    const verba = verbaVariavelCents({
      rendaPrevistaCents: 3_000_000,
      fixosCents: 488_400,
      provisaoMensalCents: 0,
    });

    // Renda 30.000 − fixos 4.884: os 18.000 de meta não aparecem em lugar nenhum.
    expect(verba).toBe(2_511_600);
    expect(verba).not.toBe(3_000_000 - 1_800_000 - 488_400);
  });

  it('meta maior que a renda inteira continua sem afetar a verba', () => {
    // O sinal de "essa meta não cabe" é `verificarMetaIrreal` (sugestoes.ts),
    // nunca uma verba artificialmente negativa.
    expect(
      verbaVariavelCents({
        rendaPrevistaCents: 500000,
        fixosCents: 200000,
        provisaoMensalCents: 0,
      }),
    ).toBeGreaterThan(0);
  });
});

describe('fixosVigentesNoCicloCents (sobreposição de intervalos)', () => {
  const CICLO = { inicio: '2026-08-01', fim: '2026-08-31' };

  function custo(patch: Partial<CustoComVigencia> = {}): CustoComVigencia {
    return { valorCents: 100_000, vigenteDe: null, vigenteAte: null, ...patch };
  }

  it('soma os custos sem vigência — o caso de todo custo recém-cadastrado', () => {
    expect(
      fixosVigentesNoCicloCents([custo({ valorCents: 200_000 }), custo({ valorCents: 88_400 })], CICLO),
    ).toBe(288_400);
  });

  it('devolve zero sem custos', () => {
    expect(fixosVigentesNoCicloCents([], CICLO)).toBe(0);
  });

  it('exclui o custo que terminou ANTES do início do ciclo', () => {
    expect(fixosVigentesNoCicloCents([custo({ vigenteAte: '2026-07-31' })], CICLO)).toBe(0);
  });

  it('exclui o custo que só começa DEPOIS do fim do ciclo', () => {
    expect(fixosVigentesNoCicloCents([custo({ vigenteDe: '2026-09-01' })], CICLO)).toBe(0);
  });

  it('inclui as duas pontas do intervalo (comparação lexicográfica, SPEC 5.1)', () => {
    expect(fixosVigentesNoCicloCents([custo({ vigenteAte: '2026-08-01' })], CICLO)).toBe(100_000);
    expect(fixosVigentesNoCicloCents([custo({ vigenteDe: '2026-08-31' })], CICLO)).toBe(100_000);
  });

  it('conta INTEIRO o custo que termina no meio do ciclo (sem rateio, por decisão)', () => {
    expect(fixosVigentesNoCicloCents([custo({ vigenteAte: '2026-08-15' })], CICLO)).toBe(100_000);
  });

  it('conta INTEIRO o custo que começa no meio do ciclo', () => {
    expect(fixosVigentesNoCicloCents([custo({ vigenteDe: '2026-08-15' })], CICLO)).toBe(100_000);
  });

  it('respeita janela fechada nas duas pontas', () => {
    const janela = custo({ vigenteDe: '2026-01-01', vigenteAte: '2026-12-31' });
    expect(fixosVigentesNoCicloCents([janela], CICLO)).toBe(100_000);
    expect(
      fixosVigentesNoCicloCents([janela], { inicio: '2027-01-01', fim: '2027-01-31' }),
    ).toBe(0);
  });

  it('recusa data malformada em vez de comparar lixo', () => {
    expect(() => fixosVigentesNoCicloCents([custo({ vigenteAte: '31/08/2026' })], CICLO)).toThrow(
      TypeError,
    );
    expect(() =>
      fixosVigentesNoCicloCents([custo()], { inicio: '2026-08-01', fim: '2026/08/31' }),
    ).toThrow(TypeError);
  });

  it('recusa valor não inteiro (dinheiro é sempre Int em centavos)', () => {
    expect(() => fixosVigentesNoCicloCents([custo({ valorCents: 100.5 })], CICLO)).toThrow();
  });
});
