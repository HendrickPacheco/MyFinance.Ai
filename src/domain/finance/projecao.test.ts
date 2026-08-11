/**
 * Testes da projeção de ciclos (tarefa C3).
 *
 * O teste mais importante deste arquivo é o primeiro bloco: a regressão da
 * decisão D-11. Parcela CONSOME a verba variável e NÃO é deduzida dela; quem
 * subtrair parcela dentro de `verbaVariavelCents` produz um número plausível
 * e falso, e é isso que os testes abaixo impedem de passar despercebido.
 */
import { describe, expect, it } from 'vitest';
import { addMeses, type DataCivil } from '@/shared/data';
import { somaCents } from '@/shared/dinheiro';
import { diasTotaisCiclo, limitesCiclo } from './ciclo';
import { gerarParcelas } from './parcelamento';
import { poupancaAlvoCents, verbaVariavelCents, type CustoComVigencia } from './verba';
import { projetarCiclos, projetarComCenario } from './projecao';
import type { CicloProjetado, EntradaProjecao, ObrigacaoFutura } from './projecao-tipos';

/** Base com os números reais do dono: renda 30k, meta 18k, fixos 4.884. */
function entradaBase(over: Partial<EntradaProjecao> = {}): EntradaProjecao {
  return {
    dataBase: '2026-08-04',
    diaRecebimento: 1,
    numCiclos: 6,
    rendaPrevistaCents: 3_000_000,
    metaPoupancaCents: 1_800_000,
    metaPoupancaPercent: null,
    fixosCents: 488_400,
    valoresProvisaoAnualCents: [],
    destinoSobra: 'RESERVA',
    rolloverInicialCents: 0,
    pisoDiarioVerbaCents: 5_000,
    obrigacoesFuturas: [],
    ...over,
  };
}

/** Parcelas mensais a partir de uma data, como obrigações já gravadas. */
function parcelasMensais(params: {
  valorTotalCents: number;
  numParcelas: number;
  dataCompra: DataCivil;
  parcelamentoId?: string;
}): ObrigacaoFutura[] {
  return gerarParcelas(params).map((p) => ({
    data: p.data,
    valorCents: p.valorCents,
    parcelamentoId: params.parcelamentoId ?? 'parc-1',
  }));
}

function em(ciclos: readonly CicloProjetado[], i: number): CicloProjetado {
  const ciclo = ciclos[i];
  if (!ciclo) throw new Error(`ciclo ${i} não existe na projeção`);
  return ciclo;
}

describe('projetarCiclos — regressão da decisão D-11 (parcela não é deduzida da verba)', () => {
  it('mantém verbaVariavelCents idêntico ao do motor, com parcela ativa', () => {
    const entrada = entradaBase({
      obrigacoesFuturas: parcelasMensais({
        valorTotalCents: 1_300_000,
        numParcelas: 13,
        dataCompra: '2026-08-10',
      }),
    });

    const ciclos = projetarCiclos(entrada);
    const primeiro = em(ciclos, 0);

    // (a) a parcela NÃO foi subtraída da verba: bate com a chamada isolada.
    const verbaIsolada = verbaVariavelCents({
      rendaPrevistaCents: entrada.rendaPrevistaCents,
      poupancaAlvoCents: poupancaAlvoCents({
        rendaPrevistaCents: entrada.rendaPrevistaCents,
        metaPoupancaCents: entrada.metaPoupancaCents,
        metaPoupancaPercent: entrada.metaPoupancaPercent,
      }),
      fixosCents: entrada.fixosCents,
      provisaoMensalCents: 0,
      rolloverRecebidoCents: 0,
    });
    expect(primeiro.verbaVariavelCents).toBe(verbaIsolada);
    expect(primeiro.parcelasComprometidasCents).toBe(100_000);

    // (b) a verba livre é a diferença, em todos os ciclos.
    for (const ciclo of ciclos) {
      expect(ciclo.verbaLivreCents).toBe(
        ciclo.verbaVariavelCents - ciclo.parcelasComprometidasCents,
      );
    }
  });

  it('não conta a parcela duas vezes: dobrar a parcela só mexe na verba livre', () => {
    const simples = projetarCiclos(
      entradaBase({
        obrigacoesFuturas: parcelasMensais({
          valorTotalCents: 1_300_000,
          numParcelas: 13,
          dataCompra: '2026-08-10',
        }),
      }),
    );
    const dobrada = projetarCiclos(
      entradaBase({
        obrigacoesFuturas: parcelasMensais({
          valorTotalCents: 2_600_000,
          numParcelas: 13,
          dataCompra: '2026-08-10',
        }),
      }),
    );

    const antes = em(simples, 0);
    const depois = em(dobrada, 0);

    expect(depois.verbaVariavelCents).toBe(antes.verbaVariavelCents);
    expect(depois.parcelasComprometidasCents).toBe(antes.parcelasComprometidasCents * 2);
    expect(depois.verbaLivreCents).toBe(antes.verbaLivreCents - antes.parcelasComprometidasCents);
  });
});

describe('projetarCiclos — limites de ciclo', () => {
  it.each([1, 5, 28, 31])('diaRecebimento %i bate com limitesCiclo isolado', (diaRecebimento) => {
    const ciclos = projetarCiclos(entradaBase({ diaRecebimento, numCiclos: 8 }));

    for (const ciclo of ciclos) {
      expect(limitesCiclo(ciclo.inicio, diaRecebimento)).toEqual({
        inicio: ciclo.inicio,
        fim: ciclo.fim,
      });
      expect(ciclo.diasTotais).toBe(diasTotaisCiclo({ inicio: ciclo.inicio, fim: ciclo.fim }));
    }
  });

  it('encadeia os ciclos sem buraco nem sobreposição', () => {
    const ciclos = projetarCiclos(entradaBase({ diaRecebimento: 5, numCiclos: 12 }));

    for (let i = 1; i < ciclos.length; i += 1) {
      expect(em(ciclos, i).inicio > em(ciclos, i - 1).fim).toBe(true);
      expect(diasTotaisCiclo({ inicio: em(ciclos, i - 1).fim, fim: em(ciclos, i).inicio })).toBe(2);
    }
  });

  it('atravessa a virada de ano (dez -> jan)', () => {
    const ciclos = projetarCiclos(entradaBase({ dataBase: '2026-12-15', numCiclos: 3 }));

    expect(em(ciclos, 0).inicio).toBe('2026-12-01');
    expect(em(ciclos, 1).inicio).toBe('2027-01-01');
    expect(em(ciclos, 2).inicio).toBe('2027-02-01');
  });

  it('atravessa fevereiro bissexto com diaRecebimento 31 (clamp)', () => {
    const ciclos = projetarCiclos(
      entradaBase({ dataBase: '2028-01-31', diaRecebimento: 31, numCiclos: 3 }),
    );

    expect(em(ciclos, 0).inicio).toBe('2028-01-31');
    // 2028 é bissexto: o corte de fevereiro cai em 29.
    expect(em(ciclos, 1).inicio).toBe('2028-02-29');
    expect(em(ciclos, 2).inicio).toBe('2028-03-31');
  });
});

describe('projetarCiclos — alívio no fim do parcelamento', () => {
  it('parcela de 13x zera no ciclo seguinte ao último, e a verba livre sobe exatamente o valor', () => {
    const entrada = entradaBase({
      numCiclos: 15,
      obrigacoesFuturas: parcelasMensais({
        valorTotalCents: 1_300_000,
        numParcelas: 13,
        dataCompra: '2026-08-10',
      }),
    });

    const ciclos = projetarCiclos(entrada);

    // 13 parcelas mensais a partir de agosto/2026 -> ciclos 1..13 (índices 0..12).
    for (let i = 0; i <= 12; i += 1) {
      expect(em(ciclos, i).parcelasComprometidasCents).toBe(100_000);
    }
    expect(em(ciclos, 13).parcelasComprometidasCents).toBe(0);
    expect(em(ciclos, 14).parcelasComprometidasCents).toBe(0);

    expect(em(ciclos, 13).verbaLivreCents - em(ciclos, 12).verbaLivreCents).toBe(100_000);
  });
});

describe('projetarComCenario — pré-mortem de compra', () => {
  const dataCompra = '2026-09-01'; // início do ciclo 2

  it('R$ 3.000 em 10x soma exatamente 300000 nas parcelas adicionadas', () => {
    const entrada = entradaBase({ numCiclos: 12 });
    const { delta } = projetarComCenario(entrada, {
      descricao: 'Notebook',
      valorTotalCents: 300_000,
      numParcelas: 10,
      dataCompra,
    });

    expect(somaCents(delta.map((d) => d.parcelasComprometidasCents))).toBe(300_000);
  });

  it('o delta por ciclo é o valor da parcela, e zero fora da janela', () => {
    const entrada = entradaBase({ numCiclos: 12 });
    const { delta } = projetarComCenario(entrada, {
      descricao: 'Notebook',
      valorTotalCents: 300_000,
      numParcelas: 10,
      dataCompra,
    });

    // Ciclo 1 (índice 0) é anterior à compra: intocado.
    expect(delta[0]?.parcelasComprometidasCents).toBe(0);
    expect(delta[0]?.verbaLivreCents).toBe(0);

    // Ciclos 2..11 (índices 1..10) carregam uma parcela de R$ 300,00 cada.
    for (let i = 1; i <= 10; i += 1) {
      expect(delta[i]?.parcelasComprometidasCents).toBe(30_000);
      expect(delta[i]?.verbaLivreCents).toBe(-30_000);
    }

    // Ciclo 12 (índice 11) já está depois da última parcela.
    expect(delta[11]?.parcelasComprometidasCents).toBe(0);
  });

  it('a base não é contaminada pelo cenário', () => {
    const entrada = entradaBase({ numCiclos: 6 });
    const { base } = projetarComCenario(entrada, {
      descricao: 'Notebook',
      valorTotalCents: 300_000,
      numParcelas: 10,
      dataCompra,
    });

    expect(base).toEqual(projetarCiclos(entrada));
  });

  it('marca o ciclo que passou a ficar abaixo do piso, e não os anteriores', () => {
    // Verba variável do ciclo = 711.600; agosto tem 31 dias -> 22.954/dia.
    // Piso em 22.000 deixa a base folgada e uma parcela de R$ 400 derruba.
    const entrada = entradaBase({ numCiclos: 6, pisoDiarioVerbaCents: 22_000 });
    const { base, comCenario, delta } = projetarComCenario(entrada, {
      descricao: 'Sofá',
      valorTotalCents: 120_000,
      numParcelas: 3,
      dataCompra: '2026-10-05', // ciclo 3 (índice 2)
    });

    expect(base.every((c) => !c.abaixoDoPiso)).toBe(true);

    expect(em(comCenario, 0).abaixoDoPiso).toBe(false);
    expect(em(comCenario, 1).abaixoDoPiso).toBe(false);
    expect(em(comCenario, 2).abaixoDoPiso).toBe(true);

    expect(delta[1]?.passouAFicarAbaixoDoPiso).toBe(false);
    expect(delta[2]?.passouAFicarAbaixoDoPiso).toBe(true);
  });
});

describe('projetarCiclos — parâmetros do ciclo', () => {
  it('metaPoupancaPercent tem precedência sobre metaPoupancaCents em todos os ciclos', () => {
    const ciclos = projetarCiclos(
      entradaBase({ metaPoupancaPercent: 20, metaPoupancaCents: 1_800_000 }),
    );

    // 20% de R$ 30.000 = R$ 6.000, não os R$ 18.000 do valor absoluto.
    for (const ciclo of ciclos) {
      expect(ciclo.poupancaAlvoCents).toBe(600_000);
    }
  });

  it('só o ciclo 1 herda rollover — sobra futura é assumida zero', () => {
    const ciclos = projetarCiclos(
      entradaBase({ destinoSobra: 'ROLLOVER', rolloverInicialCents: 50_000 }),
    );

    expect(em(ciclos, 0).rolloverRecebidoCents).toBe(50_000);
    for (let i = 1; i < ciclos.length; i += 1) {
      expect(em(ciclos, i).rolloverRecebidoCents).toBe(0);
    }
  });

  it('destinoSobra != ROLLOVER mantém rollover zero nos ciclos >= 2', () => {
    const ciclos = projetarCiclos(entradaBase({ destinoSobra: 'RESERVA' }));

    for (let i = 1; i < ciclos.length; i += 1) {
      expect(em(ciclos, i).rolloverRecebidoCents).toBe(0);
    }
  });

  it('rateia a provisão mensal a partir das provisões anuais', () => {
    const ciclos = projetarCiclos(
      entradaBase({ valoresProvisaoAnualCents: [1_200_000, 600_000] }),
    );

    // floor(1.800.000 / 12) = 150.000
    expect(em(ciclos, 0).provisaoMensalCents).toBe(150_000);
    expect(em(ciclos, 0).verbaLivreCents).toBe(
      em(ciclos, 0).verbaVariavelCents - em(ciclos, 0).parcelasComprometidasCents,
    );
  });

  it('ignora obrigação fora do horizonte projetado', () => {
    const ciclos = projetarCiclos(
      entradaBase({
        numCiclos: 2,
        obrigacoesFuturas: [
          { data: addMeses('2026-08-10', 10), valorCents: 999_999, parcelamentoId: 'p' },
        ],
      }),
    );

    expect(ciclos.every((c) => c.parcelasComprometidasCents === 0)).toBe(true);
  });
});

describe('projetarCiclos — ciclo congelado como entrada', () => {
  const congelado = {
    inicio: '2026-07-05',
    fim: '2026-08-04',
    rendaPrevistaCents: 800_000,
    poupancaAlvoCents: 0,
    fixosCents: 200_000,
    provisaoMensalCents: 10_000,
    // Incoerente com as partes de propósito (estado pós-puxarDaReserva).
    verbaVariavelCents: 700_000,
    rolloverRecebidoCents: 0,
  };

  it('emite o ciclo 1 tal e qual, sem recompor a verba pelas partes', () => {
    const ciclos = projetarCiclos(entradaBase({ cicloCongelado: congelado, numCiclos: 3 }));

    expect(em(ciclos, 0).inicio).toBe('2026-07-05');
    expect(em(ciclos, 0).fim).toBe('2026-08-04');
    expect(em(ciclos, 0).verbaVariavelCents).toBe(700_000);
    expect(em(ciclos, 0).poupancaAlvoCents).toBe(0);
  });

  it('deriva os ciclos seguintes do fim do congelado, sem sobrepor', () => {
    const ciclos = projetarCiclos(
      entradaBase({ cicloCongelado: congelado, diaRecebimento: 20, numCiclos: 3 }),
    );

    expect(em(ciclos, 1).inicio).toBe('2026-08-05');
    for (let i = 1; i < ciclos.length; i += 1) {
      expect(em(ciclos, i).inicio > em(ciclos, i - 1).fim).toBe(true);
    }
  });

  it('ignora dataBase quando há ciclo congelado', () => {
    const comData = projetarCiclos(
      entradaBase({ cicloCongelado: congelado, dataBase: '2027-03-15', numCiclos: 2 }),
    );

    expect(em(comData, 0).inicio).toBe('2026-07-05');
  });
});

describe('projetarCiclos — bordas', () => {
  it('fevereiro comum (não bissexto) com diaRecebimento 31', () => {
    const ciclos = projetarCiclos(
      entradaBase({ dataBase: '2026-01-31', diaRecebimento: 31, numCiclos: 3 }),
    );

    expect(em(ciclos, 0).inicio).toBe('2026-01-31');
    expect(em(ciclos, 1).inicio).toBe('2026-02-28'); // clamp: fevereiro comum
    expect(em(ciclos, 2).inicio).toBe('2026-03-31');
  });

  it('verba negativa (renda menor que fixos + poupança) não vira float nem esconde o aperto', () => {
    const ciclos = projetarCiclos(
      entradaBase({
        rendaPrevistaCents: 500_000,
        metaPoupancaCents: 300_000,
        fixosCents: 400_000,
        numCiclos: 3,
      }),
    );

    for (const ciclo of ciclos) {
      expect(ciclo.verbaVariavelCents).toBeLessThan(0);
      expect(Number.isInteger(ciclo.verbaDiariaLivreCents)).toBe(true);
      expect(ciclo.verbaDiariaLivreCents).toBeLessThan(0);
      expect(ciclo.abaixoDoPiso).toBe(true);
    }
  });

  it('numCiclos 1 devolve exatamente um ciclo', () => {
    expect(projetarCiclos(entradaBase({ numCiclos: 1 }))).toHaveLength(1);
  });

  it('horizonte que não alcança a parcela deixa tudo em zero', () => {
    const ciclos = projetarCiclos(
      entradaBase({
        numCiclos: 2,
        obrigacoesFuturas: parcelasMensais({
          valorTotalCents: 500_000,
          numParcelas: 5,
          dataCompra: '2027-06-10',
        }),
      }),
    );

    expect(ciclos.every((c) => c.parcelasComprometidasCents === 0)).toBe(true);
  });
});

describe('projetarCiclos — contratos', () => {
  it.each([0, -1, 61, 1.5])('numCiclos %s lança RangeError', (numCiclos) => {
    expect(() => projetarCiclos(entradaBase({ numCiclos }))).toThrow(RangeError);
  });

  it('é determinística: mesma entrada, duas chamadas, estruturas idênticas', () => {
    const entrada = entradaBase({
      numCiclos: 12,
      obrigacoesFuturas: parcelasMensais({
        valorTotalCents: 1_300_000,
        numParcelas: 13,
        dataCompra: '2026-08-10',
      }),
    });

    expect(projetarCiclos(entrada)).toStrictEqual(projetarCiclos(entrada));
  });

  it('nenhum campo *Cents da saída é float', () => {
    const ciclos = projetarCiclos(
      entradaBase({
        numCiclos: 12,
        metaPoupancaPercent: 17, // percentual que não divide redondo
        valoresProvisaoAnualCents: [1_000_001, 777_777],
        obrigacoesFuturas: parcelasMensais({
          valorTotalCents: 999_999,
          numParcelas: 7,
          dataCompra: '2026-08-10',
        }),
      }),
    );

    for (const ciclo of ciclos) {
      for (const [campo, valor] of Object.entries(ciclo)) {
        if (!campo.endsWith('Cents')) continue;
        expect(typeof valor, `${campo} deveria ser number`).toBe('number');
        expect(Number.isInteger(valor), `${campo} = ${String(valor)} não é inteiro`).toBe(true);
      }
    }
  });
});

describe('projetarCiclos — vigência de custo fixo (Fase 6)', () => {
  /** Custo com vigência, com os defaults do cadastro (constante para sempre). */
  function custo(over: Partial<CustoComVigencia> = {}): CustoComVigencia {
    return { valorCents: 100_000, vigenteDe: null, vigenteAte: null, ...over };
  }

  it('sem custosComVigencia, o resultado é IDÊNTICO ao escalar de hoje (R6)', () => {
    const entrada = entradaBase({ numCiclos: 12 });

    expect(projetarCiclos({ ...entrada, custosComVigencia: undefined })).toStrictEqual(
      projetarCiclos(entrada),
    );
  });

  it('custosComVigencia sem nenhuma data equivale ao escalar de mesma soma', () => {
    const base = entradaBase({ numCiclos: 6, fixosCents: 300_000 });
    const comLista = {
      ...base,
      custosComVigencia: [custo({ valorCents: 200_000 }), custo({ valorCents: 100_000 })],
    };

    expect(projetarCiclos(comLista)).toStrictEqual(projetarCiclos(base));
  });

  it('custo fixo com vigenteAte em 12/2026 não entra no ciclo 01/2027', () => {
    // diaRecebimento 1 => ciclo k começa em 01/mm. Ciclo 1 = 08/2026.
    const entrada = entradaBase({
      dataBase: '2026-08-04',
      diaRecebimento: 1,
      numCiclos: 6,
      fixosCents: 0, // provaria nada se o fallback também somasse
      custosComVigencia: [custo({ valorCents: 100_000, vigenteAte: '2026-12-31' })],
    });

    const ciclos = projetarCiclos(entrada);

    // 08, 09, 10, 11, 12/2026 pagam; 01/2027 não.
    expect(em(ciclos, 4).inicio).toBe('2026-12-01');
    expect(em(ciclos, 4).fixosCents).toBe(100_000);
    expect(em(ciclos, 5).inicio).toBe('2027-01-01');
    expect(em(ciclos, 5).fixosCents).toBe(0);
  });

  it('o fixo do ciclo entra na verba daquele ciclo, não só no campo exibido', () => {
    const entrada = entradaBase({
      dataBase: '2026-08-04',
      diaRecebimento: 1,
      numCiclos: 6,
      fixosCents: 0,
      metaPoupancaCents: 0,
      rendaPrevistaCents: 1_000_000,
      valoresProvisaoAnualCents: [],
      custosComVigencia: [custo({ valorCents: 100_000, vigenteAte: '2026-12-31' })],
    });

    const ciclos = projetarCiclos(entrada);

    expect(em(ciclos, 4).verbaVariavelCents).toBe(900_000); // ainda paga o custo
    expect(em(ciclos, 5).verbaVariavelCents).toBe(1_000_000); // a verba respira
  });

  it('custo com vigenteDe futuro só entra a partir do ciclo dele', () => {
    const entrada = entradaBase({
      dataBase: '2026-08-04',
      diaRecebimento: 1,
      numCiclos: 4,
      fixosCents: 0,
      custosComVigencia: [custo({ valorCents: 70_000, vigenteDe: '2026-10-15' })],
    });

    const ciclos = projetarCiclos(entrada);

    expect(em(ciclos, 0).fixosCents).toBe(0); // 08/2026
    expect(em(ciclos, 1).fixosCents).toBe(0); // 09/2026
    expect(em(ciclos, 2).inicio).toBe('2026-10-01');
    expect(em(ciclos, 2).fixosCents).toBe(70_000); // entra inteiro, sem rateio
    expect(em(ciclos, 3).fixosCents).toBe(70_000);
  });

  it('cicloCongelado mantém o fixosCents gravado mesmo com vigência que o excluiria', () => {
    const entrada = entradaBase({
      dataBase: '2026-08-04',
      diaRecebimento: 1,
      numCiclos: 3,
      fixosCents: 0,
      cicloCongelado: {
        inicio: '2026-08-01',
        fim: '2026-08-31',
        rendaPrevistaCents: 3_000_000,
        poupancaAlvoCents: 1_800_000,
        fixosCents: 488_400,
        provisaoMensalCents: 0,
        verbaVariavelCents: 711_600,
        rolloverRecebidoCents: 0,
      },
      // Vigência já encerrada: excluiria o custo de TODOS os ciclos do horizonte.
      custosComVigencia: [custo({ valorCents: 488_400, vigenteAte: '2026-07-31' })],
    });

    const ciclos = projetarCiclos(entrada);

    expect(em(ciclos, 0).fixosCents).toBe(488_400); // congelado, intocado
    expect(em(ciclos, 0).verbaVariavelCents).toBe(711_600);
    expect(em(ciclos, 1).fixosCents).toBe(0); // vigência só afeta ciclos >= 2
  });
});

describe('projetarCiclos — detalhe das obrigações do ciclo (Fase 6)', () => {
  it('soma(obrigacoesDoCiclo.valorCents) === parcelasComprometidasCents em todo ciclo', () => {
    const ciclos = projetarCiclos(
      entradaBase({
        numCiclos: 12,
        obrigacoesFuturas: [
          ...parcelasMensais({
            valorTotalCents: 999_999,
            numParcelas: 7,
            dataCompra: '2026-08-10',
            parcelamentoId: 'pc-a',
          }),
          ...parcelasMensais({
            valorTotalCents: 120_000,
            numParcelas: 3,
            dataCompra: '2026-09-20',
            parcelamentoId: 'pc-b',
          }),
        ],
      }),
    );

    for (const ciclo of ciclos) {
      expect(somaCents(ciclo.obrigacoesDoCiclo.map((o) => o.valorCents))).toBe(
        ciclo.parcelasComprometidasCents,
      );
    }
  });

  it('parcela de 12x comprada em 03/2026 some do ciclo 03/2027 e termina em 02/2027', () => {
    const obrigacoes: ObrigacaoFutura[] = gerarParcelas({
      valorTotalCents: 1_200_000,
      numParcelas: 12,
      dataCompra: '2026-03-10',
    }).map((p, i) => ({
      data: p.data,
      valorCents: p.valorCents,
      parcelamentoId: 'pc-12x',
      descricao: 'Notebook',
      parcelaNum: i + 1,
      numParcelas: 12,
    }));

    const ciclos = projetarCiclos(
      entradaBase({
        dataBase: '2026-03-10',
        diaRecebimento: 1,
        numCiclos: 13,
        obrigacoesFuturas: obrigacoes,
      }),
    );

    const fevereiro = em(ciclos, 11);
    const marco = em(ciclos, 12);

    expect(fevereiro.inicio).toBe('2027-02-01');
    expect(fevereiro.parcelasComprometidasCents).toBe(100_000);
    expect(fevereiro.terminamNesteCiclo).toStrictEqual([
      { parcelamentoId: 'pc-12x', descricao: 'Notebook', valorMensalCents: 100_000 },
    ]);

    expect(marco.inicio).toBe('2027-03-01');
    expect(marco.parcelasComprometidasCents).toBe(0);
    expect(marco.obrigacoesDoCiclo).toStrictEqual([]);
    expect(marco.terminamNesteCiclo).toStrictEqual([]);
  });

  it('sem parcelaNum/numParcelas na entrada, nada é anunciado como fim de parcelamento', () => {
    const ciclos = projetarCiclos(
      entradaBase({
        numCiclos: 6,
        obrigacoesFuturas: parcelasMensais({
          valorTotalCents: 300_000,
          numParcelas: 3,
          dataCompra: '2026-08-10',
        }),
      }),
    );

    for (const ciclo of ciclos) {
      expect(ciclo.terminamNesteCiclo).toStrictEqual([]);
      for (const obrigacao of ciclo.obrigacoesDoCiclo) {
        expect(obrigacao.parcelaNum).toBeNull();
        expect(obrigacao.numParcelas).toBeNull();
        expect(obrigacao.descricao).toBeNull();
      }
    }
  });

  it('a compra hipotética detalha a parcela mas NUNCA vira fim de parcelamento', () => {
    const { comCenario } = projetarComCenario(entradaBase({ numCiclos: 6 }), {
      descricao: 'Geladeira',
      valorTotalCents: 300_000,
      numParcelas: 3,
      dataCompra: '2026-08-10',
    });

    const primeiro = em(comCenario, 0);
    expect(primeiro.obrigacoesDoCiclo).toStrictEqual([
      {
        parcelamentoId: null,
        descricao: 'Geladeira',
        valorCents: 100_000,
        parcelaNum: 1,
        numParcelas: 3,
      },
    ]);

    // A 3a (última) parcela cai no ciclo 3, e ainda assim nada é anunciado:
    // sem `parcelamentoId` não há compromisso real terminando.
    expect(em(comCenario, 2).obrigacoesDoCiclo[0]?.parcelaNum).toBe(3);
    for (const ciclo of comCenario) {
      expect(ciclo.terminamNesteCiclo).toStrictEqual([]);
    }
  });

  it('detalhe não vaza para a verba (regressão D-11)', () => {
    const entrada = entradaBase({
      numCiclos: 6,
      obrigacoesFuturas: parcelasMensais({
        valorTotalCents: 600_000,
        numParcelas: 6,
        dataCompra: '2026-08-10',
      }),
    });

    const ciclo = em(projetarCiclos(entrada), 1);
    const doMotor = verbaVariavelCents({
      rendaPrevistaCents: entrada.rendaPrevistaCents,
      poupancaAlvoCents: poupancaAlvoCents({
        rendaPrevistaCents: entrada.rendaPrevistaCents,
        metaPoupancaCents: entrada.metaPoupancaCents,
        metaPoupancaPercent: entrada.metaPoupancaPercent,
      }),
      fixosCents: entrada.fixosCents,
      provisaoMensalCents: 0,
      rolloverRecebidoCents: 0,
    });

    expect(ciclo.obrigacoesDoCiclo.length).toBeGreaterThan(0);
    expect(ciclo.verbaVariavelCents).toBe(doMotor);
  });
});
