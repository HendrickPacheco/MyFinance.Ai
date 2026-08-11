/**
 * Testes do read-model de `/projecao` (Fase 10, §3.4). Fakes em memória e
 * `RelogioFixo` — nunca a data real, nunca o banco.
 *
 * O que estes testes existem para proteger:
 *  1. R5 — abrir a projeção não pode criar ciclo;
 *  2. D-11 — `verbaLivreCents` é copiada do motor, nunca redescontada;
 *  3. o fechamento da coluna empilhada: a soma das cinco faixas TEM que bater
 *     com `totalComposicaoCents` em todos os ciclos, senão o gráfico mente;
 *  4. a manchete honesta em cada estado do horizonte (degrau, aperto,
 *     estabilidade, ciclo único, verba negativa, nada acabando).
 */
import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/shared/dinheiro';
import type { Ciclo, CustoFixo, Parcelamento } from '@/domain/model/entidades';
import {
  cicloFake,
  criarDeps,
  provisaoFake,
  transacaoFake,
  type FakeDeps,
} from './__fakes__/fakes-ciclo-fechamento';
import {
  obterResumoProjecao,
  serializarProjecaoCsv,
  type LinhaProjecao,
} from './projecao-view';

const HOJE = '2026-07-20';

/** Ciclo atual congelado: 05/07 a 04/08, verba gravada de R$ 4.900. */
function cicloAtualFake(patch: Partial<Ciclo> = {}): Ciclo {
  return cicloFake({
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    rendaPrevistaCents: 800_000,
    poupancaAlvoCents: 100_000,
    fixosCents: 200_000,
    provisaoMensalCents: 10_000,
    verbaVariavelCents: 490_000,
    ...patch,
  });
}

function custoFixoFake(patch: Partial<CustoFixo> = {}): CustoFixo {
  return {
    id: 'cf-1',
    nome: 'Aluguel',
    valorCents: 200_000,
    diaVencimento: 10,
    ativo: true,
    contaId: null,
    vigenteDe: null,
    vigenteAte: null,
    ...patch,
  };
}

function parcelamentoFake(patch: Partial<Parcelamento> = {}): Parcelamento {
  return {
    id: 'pc-1',
    descricao: 'Notebook',
    valorTotalCents: 100_000,
    numParcelas: 2,
    dataCompra: '2026-07-25',
    categoriaId: null,
    encerradoEm: null,
    ...patch,
  };
}

/** Cenário base: verba plana de R$ 4.900 por ciclo, sem parcela nenhuma. */
function depsBase(patch: Partial<Parameters<typeof criarDeps>[0]> = {}): FakeDeps {
  return criarDeps({
    hoje: HOJE,
    ciclos: [cicloAtualFake()],
    custosFixos: [custoFixoFake()],
    provisoes: [provisaoFake({ valorAnualCents: 120_000 })], // R$ 100/mês
    ...patch,
  });
}

/**
 * Cenário com um parcelamento de 2 parcelas de R$ 500: a última cai em ago/26,
 * e a verba só respira em set/26.
 */
function depsComParcelamentoAcabando(descricao: string | null = 'Notebook'): FakeDeps {
  return depsBase({
    transacoes: [
      transacaoFake({
        id: 'p1',
        data: '2026-07-25',
        valorCents: 50_000,
        parcelamentoId: 'pc-1',
        parcelaNum: 1,
        descricao,
      }),
      transacaoFake({
        id: 'p2',
        data: '2026-08-25',
        valorCents: 50_000,
        parcelamentoId: 'pc-1',
        parcelaNum: 2,
        descricao,
      }),
    ],
    parcelamentos: [parcelamentoFake()],
  });
}

describe('obterResumoProjecao — linhas', () => {
  it('mapeia uma linha por ciclo, com rótulo de competência e delta', async () => {
    const resumo = await obterResumoProjecao(depsComParcelamentoAcabando(), { numCiclos: 3 });

    expect(resumo.linhas.map((l) => l.periodoLabel)).toEqual(['jul/26', 'ago/26', 'set/26']);
    expect(resumo.totalMeses).toBe(3);

    // 4.900 − 500 nos dois primeiros; a última parcela é em ago/26, então a
    // verba só volta a 4.900 em set/26.
    expect(resumo.linhas.map((l) => l.verbaLivreCents)).toEqual([440_000, 440_000, 490_000]);
    expect(resumo.linhas.map((l) => l.deltaVerbaLivreCents)).toEqual([null, 0, 50_000]);
  });

  it('copia a verba livre do motor sem redescontar a parcela (D-11)', async () => {
    const resumo = await obterResumoProjecao(depsComParcelamentoAcabando(), { numCiclos: 2 });

    const jul = resumo.linhas[0];
    if (!jul) throw new Error('projeção sem ciclos');

    expect(jul.parcelasComprometidasCents).toBe(50_000);
    // A verba gravada é 490.000: livre = 490.000 − 50.000, e não menos.
    expect(jul.verbaLivreCents).toBe(440_000);
  });

  it('expõe o parcelamento que termina no ciclo em que ele termina', async () => {
    const resumo = await obterResumoProjecao(depsComParcelamentoAcabando(), { numCiclos: 3 });

    expect(resumo.linhas[0]?.terminamNesteCiclo).toEqual([]);
    expect(resumo.linhas[1]?.terminamNesteCiclo).toEqual([
      { parcelamentoId: 'pc-1', descricao: 'Notebook', valorMensalCents: 50_000 },
    ]);
    expect(resumo.linhas[2]?.terminamNesteCiclo).toEqual([]);
  });

  it('repassa as premissas de obterProjecao sem reescrevê-las', async () => {
    const resumo = await obterResumoProjecao(depsBase(), { numCiclos: 2 });

    expect(resumo.premissas.length).toBeGreaterThan(0);
    expect(resumo.premissas.some((p) => p.includes('Sobra zero'))).toBe(true);
  });

  it('não cria ciclo ao projetar sem ciclo aberto (R5)', async () => {
    const deps = depsBase({ ciclos: [] });

    const resumo = await obterResumoProjecao(deps, { numCiclos: 3 });

    expect(resumo.linhas).toHaveLength(3);
    expect(deps.ciclos.criarChamadas).toBe(0);
    expect(deps.ciclos.itens).toHaveLength(0);
  });
});

describe('obterResumoProjecao — fechamento da coluna empilhada', () => {
  it('a soma das cinco faixas bate com totalComposicaoCents em todos os ciclos', async () => {
    const resumo = await obterResumoProjecao(depsComParcelamentoAcabando(), { numCiclos: 6 });

    for (const linha of resumo.linhas) {
      const somaDasFaixas =
        linha.fixosCents +
        linha.provisaoMensalCents +
        linha.poupancaAlvoCents +
        linha.parcelasComprometidasCents +
        linha.verbaLivreCents;
      expect(somaDasFaixas).toBe(linha.totalComposicaoCents);
    }
  });

  it('nos ciclos futuros (rollover zero) o total das faixas é a renda prevista', async () => {
    const resumo = await obterResumoProjecao(depsBase(), { numCiclos: 4 });

    for (const linha of resumo.linhas.slice(1)) {
      expect(linha.totalComposicaoCents).toBe(linha.rendaPrevistaCents);
    }
  });

  it('com rollover congelado o total das faixas é renda + rollover, não renda', async () => {
    const deps = depsBase({ ciclos: [cicloAtualFake({ rolloverRecebidoCents: 33_000, verbaVariavelCents: 523_000 })] });

    const resumo = await obterResumoProjecao(deps, { numCiclos: 2 });
    const jul = resumo.linhas[0];
    if (!jul) throw new Error('projeção sem ciclos');

    expect(jul.totalComposicaoCents).toBe(jul.rendaPrevistaCents + 33_000);
    expect(jul.totalComposicaoCents).not.toBe(jul.rendaPrevistaCents);
  });

  it('pós-puxarDaReserva o total das faixas foge da renda — e é ele que vale', async () => {
    // A verba gravada (700.000) não é a soma das partes (590.000): SPEC 5.2.
    // Empilhar contra a renda desenharia faixas com altura errada.
    const deps = depsBase({
      ciclos: [cicloAtualFake({ poupancaAlvoCents: 0, verbaVariavelCents: 700_000 })],
    });

    const resumo = await obterResumoProjecao(deps, { numCiclos: 1 });
    const jul = resumo.linhas[0];
    if (!jul) throw new Error('projeção sem ciclos');

    expect(jul.totalComposicaoCents).toBe(910_000); // 200.000 + 10.000 + 0 + 0 + 700.000
    expect(jul.rendaPrevistaCents).toBe(800_000);
  });
});

describe('obterResumoProjecao — extremos e piso', () => {
  it('mínima e máxima trazem o rótulo do ciclo em que acontecem', async () => {
    const resumo = await obterResumoProjecao(depsComParcelamentoAcabando(), { numCiclos: 3 });

    expect(resumo.minima).toEqual({ periodoLabel: 'jul/26', verbaLivreCents: 440_000 });
    expect(resumo.maxima).toEqual({ periodoLabel: 'set/26', verbaLivreCents: 490_000 });
  });

  it('conta os meses abaixo do piso diário de verba', async () => {
    // Piso de R$ 150/dia contra ~R$ 158/dia de verba livre: só os ciclos com
    // parcela ficam abaixo.
    const deps = depsComParcelamentoAcabando();
    deps.config.mutar({ pisoDiarioVerbaCents: 15_000 });

    const resumo = await obterResumoProjecao(deps, { numCiclos: 3 });

    expect(resumo.mesesAbaixoDoPiso).toBe(2);
    expect(resumo.totalMeses).toBe(3);
  });

  it('horizonte inteiro folgado conta zero mês abaixo do piso', async () => {
    const resumo = await obterResumoProjecao(depsBase(), { numCiclos: 3 });

    expect(resumo.mesesAbaixoDoPiso).toBe(0);
  });
});

describe('obterResumoProjecao — manchete', () => {
  it('anuncia o degrau citando o parcelamento que acabou no ciclo anterior', async () => {
    const resumo = await obterResumoProjecao(depsComParcelamentoAcabando(), { numCiclos: 3 });

    expect(resumo.manchete).toBe(
      `A verba livre passa de ${formatBRL(440_000)} para ${formatBRL(490_000)} em set/26, ` +
        'quando a última parcela de Notebook acaba.',
    );
  });

  it('sem descrição na parcela, não inventa nome', async () => {
    const resumo = await obterResumoProjecao(depsComParcelamentoAcabando(null), { numCiclos: 3 });

    expect(resumo.manchete).toContain('quando a última parcela de um parcelamento acaba');
  });

  it('com vários parcelamentos terminando juntos, conta quantos', async () => {
    const deps = depsBase({
      transacoes: [
        transacaoFake({ id: 'a1', data: '2026-08-10', valorCents: 30_000, parcelamentoId: 'pc-1', parcelaNum: 2 }),
        transacaoFake({ id: 'b1', data: '2026-08-12', valorCents: 20_000, parcelamentoId: 'pc-2', parcelaNum: 3 }),
      ],
      parcelamentos: [
        parcelamentoFake(),
        parcelamentoFake({ id: 'pc-2', descricao: 'Passagem', numParcelas: 3 }),
      ],
    });

    const resumo = await obterResumoProjecao(deps, { numCiclos: 3 });

    expect(resumo.manchete).toContain('quando as 2 últimas parcelas acabam');
  });

  it('degrau sem parcelamento terminando (custo fixo saindo) é dito sem inventar causa', async () => {
    const deps = depsBase({
      custosFixos: [custoFixoFake(), custoFixoFake({ id: 'cf-2', nome: 'Curso', valorCents: 40_000, vigenteAte: '2026-08-31' })],
    });

    const resumo = await obterResumoProjecao(deps, { numCiclos: 3 });

    expect(resumo.manchete).toContain('sem nenhum parcelamento terminando nesse ciclo');
    expect(resumo.manchete).toContain('Nenhum parcelamento acaba nos próximos 3 meses.');
  });

  it('sem nada acabando no horizonte, manda aumentar o horizonte', async () => {
    const resumo = await obterResumoProjecao(depsBase(), { numCiclos: 12 });

    expect(resumo.manchete).toContain('Nenhum parcelamento acaba nos próximos 12 meses.');
    expect(resumo.manchete).toContain('Aumente para 24 meses para ver o primeiro.');
  });

  it('no maior horizonte não promete um horizonte maior que não existe', async () => {
    const resumo = await obterResumoProjecao(depsBase(), { numCiclos: 24 });

    expect(resumo.manchete).toContain('Nenhum parcelamento acaba nos próximos 24 meses.');
    expect(resumo.manchete).not.toContain('Aumente para');
  });

  it('horizonte estável diz que está estável', async () => {
    const resumo = await obterResumoProjecao(depsBase(), { numCiclos: 3 });

    expect(resumo.manchete).toContain(
      `A verba livre fica estável em ${formatBRL(490_000)} nos próximos 3 meses.`,
    );
  });

  it('horizonte que só encolhe declara o aperto', async () => {
    // Um custo fixo que ENTRA em setembro derruba a verba, e nada a levanta.
    const deps = depsBase({
      custosFixos: [custoFixoFake(), custoFixoFake({ id: 'cf-2', nome: 'Plano de saúde', valorCents: 60_000, vigenteDe: '2026-09-01' })],
    });

    const resumo = await obterResumoProjecao(deps, { numCiclos: 3 });

    expect(resumo.manchete).toContain('A verba livre não cresce no horizonte');
    expect(resumo.manchete).toContain(`quando ela cai ${formatBRL(60_000)}`);
  });

  it('ciclo único não finge comparação', async () => {
    const resumo = await obterResumoProjecao(depsBase(), { numCiclos: 1 });

    expect(resumo.manchete).toContain('Só há um ciclo no horizonte (jul/26)');
    expect(resumo.manchete).toContain('Aumente o horizonte para comparar meses.');
  });

  it('verba livre negativa é dita, mesmo quando há um degrau positivo depois', async () => {
    const deps = depsBase({
      transacoes: [
        transacaoFake({ id: 'p1', data: '2026-07-25', valorCents: 600_000, parcelamentoId: 'pc-1', parcelaNum: 2 }),
      ],
      parcelamentos: [parcelamentoFake()],
    });

    const resumo = await obterResumoProjecao(deps, { numCiclos: 3 });

    expect(resumo.minima.verbaLivreCents).toBe(-110_000);
    expect(resumo.manchete).toContain(
      `Atenção: em jul/26 a verba livre fica negativa (${formatBRL(-110_000)})`,
    );
    expect(resumo.manchete).toContain(
      `as parcelas do ciclo (${formatBRL(600_000)}) passam do que sobra`,
    );
  });
});

describe('serializarProjecaoCsv', () => {
  function linhaFake(patch: Partial<LinhaProjecao> = {}): LinhaProjecao {
    return {
      inicio: '2026-07-05',
      fim: '2026-08-04',
      periodoLabel: 'jul/26',
      rendaPrevistaCents: 800_000,
      fixosCents: 200_000,
      provisaoMensalCents: 10_000,
      poupancaAlvoCents: 100_000,
      parcelasComprometidasCents: 50_000,
      verbaLivreCents: 440_000,
      deltaVerbaLivreCents: null,
      abaixoDoPiso: false,
      terminamNesteCiclo: [],
      totalComposicaoCents: 800_000,
      ...patch,
    };
  }

  it('abre com o cabeçalho em pt-BR', () => {
    const [cabecalho] = serializarProjecaoCsv([linhaFake()]).split('\r\n');

    expect(cabecalho).toBe(
      'Mês;Início;Fim;Renda prevista;Custos fixos;Provisão;Poupança-alvo;Parcelas;Verba livre;Variação da verba livre;Total das faixas;Abaixo do piso;Termina neste ciclo',
    );
  });

  it('escreve valores em reais com vírgula decimal e sem símbolo', () => {
    const [, linha] = serializarProjecaoCsv([linhaFake()]).split('\r\n');

    expect(linha).toBe('jul/26;2026-07-05;2026-08-04;8000,00;2000,00;100,00;1000,00;500,00;4400,00;;8000,00;não;');
  });

  it('deixa a variação vazia no primeiro ciclo e preenchida nos demais', () => {
    const csv = serializarProjecaoCsv([
      linhaFake(),
      linhaFake({ periodoLabel: 'ago/26', deltaVerbaLivreCents: -29_100 }),
    ]);

    expect(csv.split('\r\n')[1]?.split(';')[9]).toBe('');
    expect(csv.split('\r\n')[2]?.split(';')[9]).toBe('-291,00');
  });

  it('marca o ciclo abaixo do piso e lista o que termina nele', () => {
    const csv = serializarProjecaoCsv([
      linhaFake({
        abaixoDoPiso: true,
        terminamNesteCiclo: [
          { parcelamentoId: 'pc-1', descricao: 'Notebook', valorMensalCents: 50_000 },
        ],
      }),
    ]);

    expect(csv).toContain(`;sim;Notebook (${formatBRL(50_000)}/mês)`);
  });

  it('escapa descrição com ponto-e-vírgula, aspas ou quebra de linha', () => {
    const csv = serializarProjecaoCsv([
      linhaFake({
        terminamNesteCiclo: [
          { parcelamentoId: 'pc-1', descricao: 'Notebook; o "grande"', valorMensalCents: 50_000 },
        ],
      }),
    ]);

    expect(csv).toContain(`"Notebook; o ""grande"" (${formatBRL(50_000)}/mês)"`);
  });

  it('parcelamento sem descrição não vira célula vazia enganosa', () => {
    const csv = serializarProjecaoCsv([
      linhaFake({
        terminamNesteCiclo: [{ parcelamentoId: 'pc-1', descricao: null, valorMensalCents: 50_000 }],
      }),
    ]);

    expect(csv).toContain(`Parcelamento sem descrição (${formatBRL(50_000)}/mês)`);
  });

  it('sem linhas, devolve só o cabeçalho', () => {
    expect(serializarProjecaoCsv([]).includes('\r\n')).toBe(false);
  });
});
