/**
 * Testes das contas do resumo da projeção (Fase 10, §3.4). São funções puras:
 * entram séries de centavos, saem índices e totais. Nenhum fake, nenhum I/O.
 */
import { describe, expect, it } from 'vitest';
import {
  contarAbaixoDoPiso,
  deltasVerbaLivreCents,
  extremosDeDegrau,
  extremosVerbaLivre,
  totalComposicaoCents,
} from './projecao-resumo';

describe('deltasVerbaLivreCents', () => {
  it('devolve null no primeiro ciclo — não há de quê comparar', () => {
    expect(deltasVerbaLivreCents([300_500, 271_400, 346_300])).toEqual([null, -29_100, 74_900]);
  });

  it('série de um ciclo devolve só o null', () => {
    expect(deltasVerbaLivreCents([300_500])).toEqual([null]);
  });

  it('série vazia devolve lista vazia', () => {
    expect(deltasVerbaLivreCents([])).toEqual([]);
  });

  it('recusa valor não inteiro — dinheiro é Int em centavos', () => {
    expect(() => deltasVerbaLivreCents([100, 100.5])).toThrow(TypeError);
  });
});

describe('extremosDeDegrau', () => {
  it('acha a maior alta e a maior queda do horizonte', () => {
    const { maiorAlta, maiorQueda } = extremosDeDegrau([300_000, 271_000, 275_000, 346_000]);

    expect(maiorAlta).toEqual({ indice: 3, deltaCents: 71_000 });
    expect(maiorQueda).toEqual({ indice: 1, deltaCents: -29_000 });
  });

  it('empate resolve pelo ciclo mais cedo — é dele que o dinheiro já está livre', () => {
    expect(extremosDeDegrau([100, 200, 200, 300]).maiorAlta).toEqual({
      indice: 1,
      deltaCents: 100,
    });
  });

  it('série plana não inventa degrau', () => {
    expect(extremosDeDegrau([500, 500, 500])).toEqual({ maiorAlta: null, maiorQueda: null });
  });

  it('série só descendente não devolve alta', () => {
    const { maiorAlta, maiorQueda } = extremosDeDegrau([500, 400, 100]);

    expect(maiorAlta).toBeNull();
    expect(maiorQueda).toEqual({ indice: 2, deltaCents: -300 });
  });

  it('ciclo único não tem degrau nenhum', () => {
    expect(extremosDeDegrau([500])).toEqual({ maiorAlta: null, maiorQueda: null });
  });

  it('degrau atravessa o zero sem perder sinal', () => {
    expect(extremosDeDegrau([-20_000, 15_000]).maiorAlta).toEqual({
      indice: 1,
      deltaCents: 35_000,
    });
  });
});

describe('extremosVerbaLivre', () => {
  it('acha mínima e máxima com os índices certos', () => {
    const { minima, maxima } = extremosVerbaLivre([300_500, 271_400, 346_300]);

    expect(minima).toEqual({ indice: 1, verbaLivreCents: 271_400 });
    expect(maxima).toEqual({ indice: 2, verbaLivreCents: 346_300 });
  });

  it('empate resolve pelo ciclo mais cedo', () => {
    const { minima, maxima } = extremosVerbaLivre([100, 100, 50, 50]);

    expect(minima.indice).toBe(2);
    expect(maxima.indice).toBe(0);
  });

  it('ciclo único é ao mesmo tempo mínima e máxima', () => {
    const { minima, maxima } = extremosVerbaLivre([42_000]);

    expect(minima).toEqual({ indice: 0, verbaLivreCents: 42_000 });
    expect(maxima).toEqual({ indice: 0, verbaLivreCents: 42_000 });
  });

  it('acha a mínima negativa em vez de tratá-la como zero', () => {
    expect(extremosVerbaLivre([10_000, -5_000]).minima).toEqual({
      indice: 1,
      verbaLivreCents: -5_000,
    });
  });

  it('lança em série vazia em vez de inventar um extremo', () => {
    expect(() => extremosVerbaLivre([])).toThrow(RangeError);
  });
});

describe('contarAbaixoDoPiso', () => {
  it('conta só os ciclos marcados', () => {
    expect(contarAbaixoDoPiso([false, true, true, false])).toBe(2);
  });

  it('horizonte inteiro acima do piso conta zero', () => {
    expect(contarAbaixoDoPiso([false, false])).toBe(0);
  });

  it('lista vazia conta zero', () => {
    expect(contarAbaixoDoPiso([])).toBe(0);
  });
});

describe('totalComposicaoCents', () => {
  it('soma as quatro faixas da coluna empilhada', () => {
    // D-16: a pilha perdeu a faixa de poupança-alvo. O dinheiro que ela
    // ocupava não sumiu — passou a morar dentro da verba livre, que agora é
    // renda − fixos − provisão − parcelas.
    expect(
      totalComposicaoCents({
        fixosCents: 488_400,
        provisaoMensalCents: 31_700,
        parcelasComprometidasCents: 421_100,
        verbaLivreCents: 2_058_800,
      }),
    ).toBe(3_000_000);
  });

  it('fecha com renda + rollover, e não com a renda sozinha', () => {
    // renda 3.000.000, rollover 50.000: verba variável = renda − fixos −
    // provisão + rollover (sem meta, D-16). A pilha então soma renda + rollover.
    const renda = 3_000_000;
    const rollover = 50_000;
    const fixos = 488_400;
    const provisao = 31_700;
    const parcelas = 421_100;
    const verbaVariavel = renda - fixos - provisao + rollover;

    const total = totalComposicaoCents({
      fixosCents: fixos,
      provisaoMensalCents: provisao,
      parcelasComprometidasCents: parcelas,
      verbaLivreCents: verbaVariavel - parcelas,
    });

    expect(total).toBe(renda + rollover);
    expect(total).not.toBe(renda);
  });

  it('a meta de poupança não é mais uma faixa: a pilha fecha sem ela (D-16)', () => {
    // Guarda invertida do teste que provava a faixa de poupança. Se alguém
    // reintroduzir a meta na soma, a altura da barra passa a exceder
    // renda + rollover e as faixas desenhadas mentem a própria escala.
    const renda = 3_000_000;
    const meta = 1_800_000;
    const fixos = 488_400;

    const total = totalComposicaoCents({
      fixosCents: fixos,
      provisaoMensalCents: 0,
      parcelasComprometidasCents: 0,
      verbaLivreCents: renda - fixos,
    });

    expect(total).toBe(renda);
    expect(total).not.toBe(renda + meta);
  });

  it('aceita verba livre negativa sem clamp', () => {
    expect(
      totalComposicaoCents({
        fixosCents: 100,
        provisaoMensalCents: 0,
        parcelasComprometidasCents: 500,
        verbaLivreCents: -400,
      }),
    ).toBe(200);
  });
});
