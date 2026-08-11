/**
 * Testes de `avaliarRendaHipotetica` (caso real 11/08/2026): a nuance que
 * importa aqui é que a meta de poupança pode não caber na renda hipotética
 * sem que isso signifique que a renda não sustenta as despesas — são duas
 * perguntas diferentes, e a função devolve uma resposta para cada.
 */
import { describe, expect, it } from 'vitest';
import type { CicloProjetado } from './projecao-tipos';
import { avaliarRendaHipotetica } from './renda-hipotetica';

/** Ciclo projetado mínimo, só com os campos que `avaliarRendaHipotetica` lê. */
function cicloFake(over: Partial<CicloProjetado> = {}): CicloProjetado {
  return {
    inicio: '2026-09-01',
    fim: '2026-09-30',
    diasTotais: 30,
    rendaPrevistaCents: 0,
    poupancaAlvoCents: 0,
    fixosCents: 0,
    provisaoMensalCents: 0,
    verbaVariavelCents: 0,
    parcelasComprometidasCents: 0,
    obrigacoesDoCiclo: [],
    terminamNesteCiclo: [],
    verbaLivreCents: 0,
    verbaDiariaLivreCents: 0,
    rolloverRecebidoCents: 0,
    abaixoDoPiso: false,
    ...over,
  };
}

describe('avaliarRendaHipotetica — meta cabe na renda (caso normal)', () => {
  it('metaPoupancaCabeNaRenda true quando a verba variável do motor é não-negativa', () => {
    const ciclo = cicloFake({
      rendaPrevistaCents: 3_000_000,
      poupancaAlvoCents: 500_000,
      fixosCents: 200_000,
      provisaoMensalCents: 50_000,
      parcelasComprometidasCents: 100_000,
      // renda - poupança - fixos - provisão = 2.250.000 (>= 0)
      verbaVariavelCents: 2_250_000,
    });

    const avaliacao = avaliarRendaHipotetica(ciclo);

    expect(avaliacao.metaPoupancaCabeNaRenda).toBe(true);
    expect(avaliacao.motivoMetaNaoCabe).toBeNull();
    expect(avaliacao.comprometidoMensalCents).toBe(300_000); // fixos + parcelas
    expect(avaliacao.sobraAposComprometidosCents).toBe(2_700_000); // renda - comprometido
    expect(avaliacao.poupancaMaximaPossivelCents).toBe(2_650_000); // sobra - provisão
  });
});

describe('avaliarRendaHipotetica — meta NÃO cabe na renda (caso real 11/08/2026)', () => {
  // Renda 15.000, fixos 5.605, parcela do ciclo 4.235,54: a meta de 18.000
  // sozinha já excede a renda, então a verba variável do motor fica negativa.
  const ciclo = cicloFake({
    rendaPrevistaCents: 1_500_000,
    poupancaAlvoCents: 1_800_000,
    fixosCents: 560_500,
    provisaoMensalCents: 0,
    parcelasComprometidasCents: 423_554,
    // 1.500.000 - 1.800.000 - 560.500 - 0 = -860.500
    verbaVariavelCents: -860_500,
  });

  it('metaPoupancaCabeNaRenda é false, com motivo em texto — nunca só o número negativo cru', () => {
    const avaliacao = avaliarRendaHipotetica(ciclo);

    expect(avaliacao.metaPoupancaCabeNaRenda).toBe(false);
    expect(avaliacao.motivoMetaNaoCabe).not.toBeNull();
    expect(avaliacao.motivoMetaNaoCabe).toMatch(/meta de poupança/i);
    expect(avaliacao.motivoMetaNaoCabe).toMatch(/renda hipotética/i);
    // Nunca cita a verba negativa como SE fosse a resposta da pergunta real.
    expect(avaliacao.motivoMetaNaoCabe).not.toMatch(/-860500|−8\.605/);
  });

  it('sobraAposComprometidosCents responde "dou conta das despesas?" — bate com os números reais do dono', () => {
    const avaliacao = avaliarRendaHipotetica(ciclo);

    // R$ 15.000,00 - R$ 5.605,00 - R$ 4.235,54 = R$ 5.159,46.
    expect(avaliacao.comprometidoMensalCents).toBe(984_054);
    expect(avaliacao.sobraAposComprometidosCents).toBe(515_946);
  });

  it('poupancaMaximaPossivelCents nunca fica negativa mesmo quando a meta não cabe', () => {
    const apertado = cicloFake({
      rendaPrevistaCents: 500_000,
      poupancaAlvoCents: 1_800_000,
      fixosCents: 560_500,
      provisaoMensalCents: 50_000,
      parcelasComprometidasCents: 423_554,
      verbaVariavelCents: 500_000 - 1_800_000 - 560_500 - 50_000,
    });

    const avaliacao = avaliarRendaHipotetica(apertado);

    expect(avaliacao.metaPoupancaCabeNaRenda).toBe(false);
    expect(avaliacao.poupancaMaximaPossivelCents).toBe(0);
    // A sobra depois de fixos e parcelas pode ser negativa de verdade — isso
    // não tem piso, porque É a resposta de "não dá para pagar as contas".
    expect(avaliacao.sobraAposComprometidosCents).toBeLessThan(0);
  });
});

describe('avaliarRendaHipotetica — poupancaMaximaPossivelCents considera provisão e rollover', () => {
  it('desconta provisão da sobra, e soma rollover recebido', () => {
    const ciclo = cicloFake({
      rendaPrevistaCents: 1_000_000,
      fixosCents: 300_000,
      provisaoMensalCents: 50_000,
      parcelasComprometidasCents: 100_000,
      rolloverRecebidoCents: 20_000,
      verbaVariavelCents: 1_000_000 - 0 - 300_000 - 50_000 + 20_000,
    });

    const avaliacao = avaliarRendaHipotetica(ciclo);

    // 1.000.000 - 300.000 - 50.000 - 100.000 + 20.000 = 570.000
    expect(avaliacao.poupancaMaximaPossivelCents).toBe(570_000);
  });
});
