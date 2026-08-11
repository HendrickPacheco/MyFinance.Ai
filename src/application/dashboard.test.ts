/**
 * Testes do read-model do painel (`obterEstadoPainel`), com foco na regra
 * mais importante do rastreamento "Pago?" (CLAUDE.md / dashboard-tipos):
 * marcar custo fixo ou parcela como pago é RASTREAMENTO, nunca recálculo.
 * Nenhum campo de verba/teto pode mudar quando o usuário marca algo como
 * pago — só `faltaPagarCents`/`jaPagueiCents` e as flags `pago`/`vencido`
 * de exibição.
 *
 * Tudo roda contra fakes em memória — nenhum acesso ao banco real.
 */
import { describe, it, expect } from 'vitest';
import { obterEstadoPainel } from './dashboard';
import {
  criarDeps,
  cicloFake,
  transacaoFake,
  em,
  CATEGORIA_VARIAVEL,
  CATEGORIA_FIXA,
  type FakeDeps,
} from './__fakes__/fakes-ciclo-fechamento';
import type { CustoFixo } from '@/domain/model/entidades';

const CICLO_JULHO = cicloFake({
  id: 'ciclo-julho',
  dataInicio: '2026-07-05',
  dataFim: '2026-08-04',
  rendaPrevistaCents: 800_000,
  poupancaAlvoCents: 100_000,
  fixosCents: 220_000,
  provisaoMensalCents: 0,
  verbaVariavelCents: 480_000,
});

const CUSTO_ALUGUEL: CustoFixo = {
  id: 'fixo-aluguel',
  nome: 'Aluguel',
  valorCents: 200_000,
  diaVencimento: 10,
  ativo: true,
  contaId: null,
  vigenteDe: null,
  vigenteAte: null,
};

const CUSTO_INTERNET: CustoFixo = {
  id: 'fixo-internet',
  nome: 'Internet',
  valorCents: 20_000,
  diaVencimento: 15,
  ativo: true,
  contaId: null,
  vigenteDe: null,
  vigenteAte: null,
};

/** Snapshot dos campos que NUNCA podem mudar por causa de "Pago?". */
function camposDeCalculo(kpis: Awaited<ReturnType<typeof obterEstadoPainel>>['kpis']) {
  return {
    verbaVariavelCents: kpis.verbaVariavelCents,
    saldoDisponivelCents: kpis.saldoDisponivelCents,
    tetoHojeCents: kpis.tetoHojeCents,
    gastoRealizadoCents: kpis.gastoRealizadoCents,
    restaHojeCents: kpis.restaHojeCents,
    gastoHojeCents: kpis.gastoHojeCents,
    sobraProjetadaCents: kpis.sobraProjetadaCents,
  };
}

function montarDeps(hoje: string): FakeDeps {
  return criarDeps({
    hoje,
    ciclos: [CICLO_JULHO],
    custosFixos: [CUSTO_ALUGUEL, CUSTO_INTERNET],
    transacoes: [
      transacaoFake({
        id: 'tx-mercado',
        data: '2026-07-12',
        valorCents: 15_000,
        cicloId: CICLO_JULHO.id,
      }),
    ],
  });
}

describe('obterEstadoPainel — "Pago?" é rastreamento, nunca recálculo (regra inviolável)', () => {
  it('marcar TODOS os custos fixos como pagos não muda nenhum campo de verba/teto', async () => {
    const deps = montarDeps('2026-07-20');

    const antes = await obterEstadoPainel(deps);

    await deps.pagamentosFixos.marcarPago(CUSTO_ALUGUEL.id, CICLO_JULHO.id, '2026-07-20');
    await deps.pagamentosFixos.marcarPago(CUSTO_INTERNET.id, CICLO_JULHO.id, '2026-07-20');

    const depois = await obterEstadoPainel(deps);

    expect(camposDeCalculo(depois.kpis)).toEqual(camposDeCalculo(antes.kpis));
    // O ciclo em si (fonte da verba congelada) também não pode ter sido tocado.
    expect(depois.ciclo).toEqual(antes.ciclo);
  });

  it('marcar uma parcela como paga não muda nenhum campo de verba/teto', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [CICLO_JULHO],
      custosFixos: [CUSTO_ALUGUEL],
    });
    const parcelamento = await deps.parcelamentos.criar({
      id: '',
      descricao: 'Notebook',
      valorTotalCents: 90_000,
      numParcelas: 3,
      dataCompra: '2026-07-10',
      categoriaId: null,
      encerradoEm: null,
    });
    deps.transacoes.itens.push(
      transacaoFake({
        id: 'tx-parcela-1',
        data: '2026-07-10',
        valorCents: 30_000,
        parcelamentoId: parcelamento.id,
        parcelaNum: 1,
        cicloId: CICLO_JULHO.id,
      }),
    );

    const antes = await obterEstadoPainel(deps);

    await deps.transacoes.marcarPaga('tx-parcela-1', '2026-07-20');

    const depois = await obterEstadoPainel(deps);

    expect(camposDeCalculo(depois.kpis)).toEqual(camposDeCalculo(antes.kpis));
    expect(depois.ciclo).toEqual(antes.ciclo);
  });

  it('atualiza faltaPagarCents/jaPagueiCents (e só esses) quando um fixo é pago', async () => {
    const deps = montarDeps('2026-07-20');

    const antes = await obterEstadoPainel(deps);
    expect(antes.kpis.faltaPagarCents).toBeGreaterThan(0);

    await deps.pagamentosFixos.marcarPago(CUSTO_ALUGUEL.id, CICLO_JULHO.id, '2026-07-20');
    const depois = await obterEstadoPainel(deps);

    expect(depois.kpis.jaPagueiCents - antes.kpis.jaPagueiCents).toBe(CUSTO_ALUGUEL.valorCents);
    expect(antes.kpis.faltaPagarCents - depois.kpis.faltaPagarCents).toBe(CUSTO_ALUGUEL.valorCents);
  });
});

describe('obterEstadoPainel — custosFixos com pago/vencido', () => {
  it('fixo vencido (venceu e não foi pago) sinaliza `vencido: true`', async () => {
    // Aluguel vence dia 10; hoje é 15 e ninguém marcou como pago.
    const deps = montarDeps('2026-07-15');

    const estado = await obterEstadoPainel(deps);
    const aluguel = estado.custosFixos.find((c) => c.custoFixoId === CUSTO_ALUGUEL.id);

    expect(aluguel?.pago).toBe(false);
    expect(aluguel?.vencido).toBe(true);
  });

  it('fixo pago nunca é vencido, mesmo com a data de vencimento no passado', async () => {
    const deps = montarDeps('2026-07-15');
    await deps.pagamentosFixos.marcarPago(CUSTO_ALUGUEL.id, CICLO_JULHO.id, '2026-07-12');

    const estado = await obterEstadoPainel(deps);
    const aluguel = estado.custosFixos.find((c) => c.custoFixoId === CUSTO_ALUGUEL.id);

    expect(aluguel?.pago).toBe(true);
    expect(aluguel?.vencido).toBe(false);
  });

  it('exatamente no dia do vencimento ainda não é vencido', async () => {
    const deps = montarDeps('2026-07-10');

    const estado = await obterEstadoPainel(deps);
    const aluguel = estado.custosFixos.find((c) => c.custoFixoId === CUSTO_ALUGUEL.id);

    expect(aluguel?.vencido).toBe(false);
  });

  it('ciclo sem custos fixos ativos devolve lista vazia sem quebrar o painel', async () => {
    const deps = criarDeps({ hoje: '2026-07-20', ciclos: [CICLO_JULHO], custosFixos: [] });

    const estado = await obterEstadoPainel(deps);

    expect(estado.custosFixos).toEqual([]);
  });

  it('"Pago?" reseta sozinho na virada do ciclo (unicidade por custoFixoId+cicloId)', async () => {
    const cicloAgosto = cicloFake({
      id: 'ciclo-agosto',
      dataInicio: '2026-08-05',
      dataFim: '2026-09-04',
      fixosCents: 220_000,
      verbaVariavelCents: 480_000,
    });
    const deps = criarDeps({
      hoje: '2026-08-06',
      ciclos: [CICLO_JULHO, cicloAgosto],
      custosFixos: [CUSTO_ALUGUEL],
    });
    // Pago em julho...
    await deps.pagamentosFixos.marcarPago(CUSTO_ALUGUEL.id, CICLO_JULHO.id, '2026-07-08');

    // ...mas em agosto (outro ciclo) ainda não tem pagamento registrado.
    const estadoAgosto = await obterEstadoPainel(deps);
    const aluguelAgosto = estadoAgosto.custosFixos.find((c) => c.custoFixoId === CUSTO_ALUGUEL.id);

    expect(aluguelAgosto?.pago).toBe(false);
  });
});

describe('obterEstadoPainel — categoriasLancamento e transacoesVariaveis (formulário de lançamento do painel)', () => {
  it('ciclo sem nenhuma transação: extrato vazio, total zero, categorias por ordem de cadastro', async () => {
    const deps = criarDeps({ hoje: '2026-07-20', ciclos: [CICLO_JULHO], transacoes: [] });

    const estado = await obterEstadoPainel(deps);

    expect(estado.transacoesVariaveis).toEqual([]);
    expect(estado.transacoesVariaveisTotalCents).toBe(0);
    expect(estado.categoriasLancamento.map((c) => c.id)).toEqual([
      CATEGORIA_VARIAVEL.id,
      CATEGORIA_FIXA.id,
    ]);
  });

  it('só parcelas no ciclo: transacoesVariaveis vem vazio (parcela tem tabela própria)', async () => {
    const deps = criarDeps({ hoje: '2026-07-20', ciclos: [CICLO_JULHO] });
    const parcelamento = await deps.parcelamentos.criar({
      id: '',
      descricao: 'Notebook',
      valorTotalCents: 90_000,
      numParcelas: 3,
      dataCompra: '2026-07-10',
      categoriaId: null,
      encerradoEm: null,
    });
    deps.transacoes.itens.push(
      transacaoFake({
        id: 'tx-parcela-3',
        data: '2026-07-10',
        valorCents: 30_000,
        parcelamentoId: parcelamento.id,
        parcelaNum: 1,
        cicloId: CICLO_JULHO.id,
      }),
    );

    const estado = await obterEstadoPainel(deps);

    expect(estado.transacoesVariaveis).toEqual([]);
    expect(estado.transacoesVariaveisTotalCents).toBe(0);
  });

  it('estorno maior que a despesa: total do extrato fica negativo', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [CICLO_JULHO],
      transacoes: [
        transacaoFake({ id: 'tx-despesa', data: '2026-07-10', valorCents: 5_000, cicloId: CICLO_JULHO.id }),
        transacaoFake({
          id: 'tx-estorno',
          data: '2026-07-12',
          valorCents: 8_000,
          tipo: 'ESTORNO',
          cicloId: CICLO_JULHO.id,
        }),
      ],
    });

    const estado = await obterEstadoPainel(deps);

    expect(estado.transacoesVariaveisTotalCents).toBe(-3_000);
    const linhaEstorno = estado.transacoesVariaveis.find((l) => l.transacaoId === 'tx-estorno');
    expect(linhaEstorno?.ehEstorno).toBe(true);
  });

  it('transação sem categoria não quebra o painel e fica fora do extrato', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [CICLO_JULHO],
      transacoes: [
        transacaoFake({
          id: 'tx-sem-categoria',
          data: '2026-07-10',
          valorCents: 5_000,
          categoriaId: null,
          cicloId: CICLO_JULHO.id,
        }),
      ],
    });

    const estado = await obterEstadoPainel(deps);

    expect(estado.transacoesVariaveis).toEqual([]);
    expect(estado.transacoesVariaveisTotalCents).toBe(0);
  });

  it('transacoesVariaveisTotalCents bate exatamente com a parcela variável (sem parcelas) do total de gastos dos KPIs', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [CICLO_JULHO],
      transacoes: [
        transacaoFake({ id: 'tx-mercado-1', data: '2026-07-10', valorCents: 12_000, cicloId: CICLO_JULHO.id }),
        transacaoFake({ id: 'tx-mercado-2', data: '2026-07-15', valorCents: 3_000, cicloId: CICLO_JULHO.id }),
      ],
    });

    const estado = await obterEstadoPainel(deps);

    // KPI totalGastosCents = fixos + parcelas + gastoVariavelSemParcelas.
    // Descontando fixos e parcelas do total dos KPIs, o que sobra É a mesma
    // verba variável do extrato — os dois números têm que bater exatamente.
    const parcelaVariavelDoTotalGastos =
      estado.kpis.totalGastosCents - estado.kpis.custosFixosCents - estado.kpis.parceladosCicloCents;
    expect(parcelaVariavelDoTotalGastos).toBe(estado.transacoesVariaveisTotalCents);
    expect(estado.transacoesVariaveisTotalCents).toBe(15_000);
  });

  // Regressão: transação lançada com competência FUTURA dentro do ciclo sumia
  // do painel inteiro (não é fixo, não é parcela, não é provisão) enquanto
  // seguia visível no extrato da tela Ciclo e nos gráficos — que não filtram
  // por data. Agora aparece marcada, sem contaminar o realizado.
  it('competência futura dentro do ciclo aparece no extrato marcada como programada, fora do total realizado', async () => {
    const deps = criarDeps({
      hoje: '2026-07-20',
      ciclos: [CICLO_JULHO],
      transacoes: [
        transacaoFake({ id: 'tx-hoje', data: '2026-07-20', valorCents: 4_000, cicloId: CICLO_JULHO.id }),
        transacaoFake({ id: 'tx-futura', data: '2026-07-28', valorCents: 78_336, cicloId: CICLO_JULHO.id }),
      ],
    });

    const estado = await obterEstadoPainel(deps);

    expect(estado.transacoesVariaveis.map((l) => l.transacaoId)).toEqual(['tx-futura', 'tx-hoje']);
    expect(estado.transacoesVariaveis.find((l) => l.transacaoId === 'tx-futura')?.ehProgramado).toBe(true);
    expect(estado.transacoesVariaveis.find((l) => l.transacaoId === 'tx-hoje')?.ehProgramado).toBe(false);

    // O realizado (e portanto verba/teto) ignora a futura — só o campo separado a soma.
    expect(estado.transacoesVariaveisTotalCents).toBe(4_000);
    expect(estado.transacoesVariaveisProgramadasCents).toBe(78_336);
    expect(estado.kpis.gastoRealizadoCents).toBe(4_000);

    // A pizza é a decomposição do realizado: a futura não entra calada nela.
    const totalDasFatias = estado.categorias.reduce((soma, f) => soma + f.totalCents, 0);
    expect(totalDasFatias).toBe(estado.kpis.gastoRealizadoCents);
    expect(totalDasFatias).toBe(4_000);
  });
});

describe('obterEstadoPainel — parcelados com transacaoId e pago', () => {
  it('expõe transacaoId (alvo do toggle) e pago=false por padrão', async () => {
    const deps = criarDeps({ hoje: '2026-07-20', ciclos: [CICLO_JULHO] });
    const parcelamento = await deps.parcelamentos.criar({
      id: '',
      descricao: 'Notebook',
      valorTotalCents: 90_000,
      numParcelas: 3,
      dataCompra: '2026-07-10',
      categoriaId: null,
      encerradoEm: null,
    });
    deps.transacoes.itens.push(
      transacaoFake({
        id: 'tx-parcela-2',
        data: '2026-07-10',
        valorCents: 30_000,
        parcelamentoId: parcelamento.id,
        parcelaNum: 1,
        cicloId: CICLO_JULHO.id,
      }),
    );

    const estado = await obterEstadoPainel(deps);
    const linha = em(estado.parcelados, 0);

    expect(linha.transacaoId).toBe('tx-parcela-2');
    expect(linha.pago).toBe(false);
  });
});
