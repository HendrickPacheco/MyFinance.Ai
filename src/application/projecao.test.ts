/**
 * Testes do read-model de projeção (tarefa C5). Tudo com fakes em memória e
 * `RelogioFixo` — nunca a data real da máquina, nunca o banco.
 *
 * Dois pontos que estes testes existem para proteger:
 *  1. o congelamento (SPEC 5.2): editar a Config não pode mudar o ciclo atual;
 *  2. a decisão D-11: parcela entra em `parcelasComprometidasCents` e NÃO é
 *     abatida de `verbaVariavelCents` — agora no nível onde o dado real entra.
 */
import { describe, expect, it } from 'vitest';
import type { CustoFixo } from '@/domain/model/entidades';
import { verbaVariavelCents } from '@/domain/finance';
import { criarDeps, cicloFake, provisaoFake, transacaoFake, type FakeDeps } from './__fakes__/fakes-ciclo-fechamento';
import { obterProjecao } from './projecao';
import { ConfigAusenteError } from './ciclos';

const HOJE = '2026-07-20';

function custoFixoFake(patch: Partial<CustoFixo> = {}): CustoFixo {
  return {
    id: 'cf-1',
    nome: 'Aluguel',
    valorCents: 200_000,
    diaVencimento: 10,
    ativo: true,
    contaId: null,
    ...patch,
  };
}

/** Ciclo atual congelado cobrindo HOJE (diaRecebimento 5 da CONFIG_PADRAO). */
function cicloAtualFake() {
  return cicloFake({
    id: 'ciclo-atual',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    rendaPrevistaCents: 800_000,
    poupancaAlvoCents: 100_000,
    fixosCents: 200_000,
    provisaoMensalCents: 10_000,
    verbaVariavelCents: 490_000,
    rolloverRecebidoCents: 0,
  });
}

/** Fotografa o estado dos fakes para provar que nada foi escrito. */
function fotografar(deps: FakeDeps): string {
  return JSON.stringify({
    ciclos: deps.ciclos.itens,
    transacoes: deps.transacoes.itens,
    contas: deps.contas.itens,
  });
}

describe('obterProjecao — congelamento do ciclo atual (SPEC 5.2)', () => {
  it('ciclo 1 usa os valores congelados; ciclo 2 usa a Config vigente', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtualFake()],
      custosFixos: [custoFixoFake({ valorCents: 350_000 })],
      provisoes: [provisaoFake({ valorAnualCents: 240_000 })],
    });

    // O usuário editou a Config DEPOIS de o ciclo nascer.
    deps.config.mutar({ rendaBaseCents: 900_000, metaPoupancaCents: 150_000 });

    const { ciclos } = await obterProjecao(deps, { numCiclos: 3 });

    const atual = ciclos[0];
    const proximo = ciclos[1];
    if (!atual || !proximo) throw new Error('projeção devolveu menos ciclos que o pedido');

    // Congelado: exatamente o que está gravado no registro Ciclo.
    expect(atual.inicio).toBe('2026-07-05');
    expect(atual.rendaPrevistaCents).toBe(800_000);
    expect(atual.poupancaAlvoCents).toBe(100_000);
    expect(atual.fixosCents).toBe(200_000);
    expect(atual.provisaoMensalCents).toBe(10_000);
    expect(atual.verbaVariavelCents).toBe(490_000);

    // Vigente: a Config editada, mais os fixos e provisões ativos de hoje.
    expect(proximo.inicio).toBe('2026-08-05');
    expect(proximo.rendaPrevistaCents).toBe(900_000);
    expect(proximo.poupancaAlvoCents).toBe(150_000);
    expect(proximo.fixosCents).toBe(350_000);
    expect(proximo.provisaoMensalCents).toBe(20_000); // floor(240.000 / 12)
  });

  it('a verba do ciclo atual bate com a gravada, não com a recalculada pela Config nova', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAtualFake()] });
    deps.config.mutar({ rendaBaseCents: 5_000_000 });

    const { ciclos } = await obterProjecao(deps, { numCiclos: 2 });

    expect(ciclos[0]?.verbaVariavelCents).toBe(490_000);
    expect(ciclos[1]?.verbaVariavelCents).not.toBe(490_000);
  });

  it('metaPoupancaPercent da Config não recalcula a poupança já congelada', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAtualFake()] });
    deps.config.mutar({ metaPoupancaPercent: 50 });

    const { ciclos } = await obterProjecao(deps, { numCiclos: 2 });

    expect(ciclos[0]?.poupancaAlvoCents).toBe(100_000); // congelado
    expect(ciclos[1]?.poupancaAlvoCents).toBe(400_000); // 50% de R$ 8.000
  });

  it('sem ciclo aberto, projeta tudo pela Config e declara a premissa', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [] });

    const { ciclos, premissas } = await obterProjecao(deps, { numCiclos: 3 });

    expect(ciclos).toHaveLength(3);
    expect(ciclos[0]?.rendaPrevistaCents).toBe(800_000);
    expect(premissas.some((p) => p.includes('Ainda não há ciclo aberto'))).toBe(true);
  });

  it('herda o rollover congelado só no ciclo atual', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloFake({ ...cicloAtualFake(), rolloverRecebidoCents: 33_000 })],
    });

    const { ciclos } = await obterProjecao(deps, { numCiclos: 3 });

    expect(ciclos[0]?.rolloverRecebidoCents).toBe(33_000);
    expect(ciclos[1]?.rolloverRecebidoCents).toBe(0);
    expect(ciclos[2]?.rolloverRecebidoCents).toBe(0);
  });
});

describe('obterProjecao — decisão D-11 com dado real', () => {
  it('parcela gravada entra em parcelasComprometidas sem ser abatida da verba', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtualFake()],
      transacoes: [
        transacaoFake({ id: 'p1', data: '2026-07-25', valorCents: 50_000, parcelamentoId: 'pc-1', parcelaNum: 1 }),
        transacaoFake({ id: 'p2', data: '2026-08-25', valorCents: 50_000, parcelamentoId: 'pc-1', parcelaNum: 2 }),
      ],
    });

    const { ciclos } = await obterProjecao(deps, { numCiclos: 2 });
    const atual = ciclos[0];
    if (!atual) throw new Error('sem ciclo projetado');

    // A verba continua sendo a congelada — a parcela NÃO foi descontada dela.
    expect(atual.verbaVariavelCents).toBe(490_000);
    expect(atual.parcelasComprometidasCents).toBe(50_000);
    expect(atual.verbaLivreCents).toBe(440_000);

    // E confere com a função do motor chamada isoladamente.
    expect(atual.verbaVariavelCents).toBe(
      verbaVariavelCents({
        rendaPrevistaCents: 800_000,
        poupancaAlvoCents: 100_000,
        fixosCents: 200_000,
        provisaoMensalCents: 10_000,
        rolloverRecebidoCents: 0,
      }),
    );
  });

  it('não duplica a parcela quando ela cai na fronteira entre os dois segmentos', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtualFake()],
      transacoes: [
        // Último dia do ciclo atual e primeiro do seguinte.
        transacaoFake({ id: 'p1', data: '2026-08-04', valorCents: 70_000, parcelamentoId: 'pc-1' }),
        transacaoFake({ id: 'p2', data: '2026-08-05', valorCents: 70_000, parcelamentoId: 'pc-1' }),
      ],
    });

    const { ciclos } = await obterProjecao(deps, { numCiclos: 3 });

    expect(ciclos[0]?.parcelasComprometidasCents).toBe(70_000);
    expect(ciclos[1]?.parcelasComprometidasCents).toBe(70_000);
    expect(ciclos[2]?.parcelasComprometidasCents).toBe(0);
  });

  it('ignora gasto comum: só transação com parcelamentoId vira obrigação', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtualFake()],
      transacoes: [
        transacaoFake({ id: 'g1', data: '2026-07-25', valorCents: 12_345 }), // sem parcelamentoId
      ],
    });

    const { ciclos } = await obterProjecao(deps, { numCiclos: 2 });

    expect(ciclos[0]?.parcelasComprometidasCents).toBe(0);
  });
});

describe('obterProjecao — cenário hipotético', () => {
  it('devolve base, cenário e delta somando exatamente o valor da compra', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAtualFake()] });

    const resultado = await obterProjecao(deps, {
      numCiclos: 12,
      cenario: {
        descricao: 'Notebook',
        valorTotalCents: 300_000,
        numParcelas: 10,
        dataCompra: '2026-08-10',
      },
    });

    expect(resultado.cenario).not.toBeNull();
    const somaDelta = resultado.cenario?.delta.reduce(
      (s, d) => s + d.parcelasComprometidasCents,
      0,
    );
    expect(somaDelta).toBe(300_000);

    // A base fica intocada pelo cenário.
    const base = await obterProjecao(deps, { numCiclos: 12 });
    expect(resultado.ciclos).toEqual(base.ciclos);
  });

  it('sem cenário pedido, o campo vem null', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAtualFake()] });

    const { cenario } = await obterProjecao(deps, { numCiclos: 3 });

    expect(cenario).toBeNull();
  });
});

describe('obterProjecao — contratos', () => {
  it('Config ausente lança ConfigAusenteError', async () => {
    const deps = criarDeps({ hoje: HOJE, config: null });

    await expect(obterProjecao(deps, { numCiclos: 3 })).rejects.toBeInstanceOf(ConfigAusenteError);
  });

  it('é read-only: não grava nada e não cria ciclo', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtualFake()],
      transacoes: [transacaoFake({ id: 'p1', data: '2026-07-25', parcelamentoId: 'pc-1' })],
    });

    const antes = fotografar(deps);
    await obterProjecao(deps, {
      numCiclos: 6,
      cenario: { descricao: 'X', valorTotalCents: 100_000, numParcelas: 4, dataCompra: '2026-09-01' },
    });

    expect(fotografar(deps)).toBe(antes);
    expect(deps.ciclos.criarChamadas).toBe(0);
    expect(deps.config.salvarChamadas).toBe(0);
  });

  it('não cria ciclo nem quando não existe nenhum (não chama garantirCicloAtual)', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [] });

    await obterProjecao(deps, { numCiclos: 3 });

    expect(deps.ciclos.itens).toHaveLength(0);
    expect(deps.ciclos.criarChamadas).toBe(0);
  });
});
