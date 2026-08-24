/**
 * Testes de `src/application/custos.ts` (TASKS-CUSTOS Fase 4). Cobrem:
 * exclusão recusada com histórico vinculado (custo fixo com `PagamentoFixo`,
 * provisão com acumulado != 0), exclusão bem-sucedida sem histórico,
 * desativação reversível, e a regra mais importante (R1): editar/excluir um
 * `CustoFixo` nunca altera `Ciclo.fixosCents` de um ciclo já fechado.
 */
import { describe, expect, it } from 'vitest';
import {
  criarDeps,
  cicloFake,
  contaFake,
  transacaoFake,
  ATOR_OWNER,
  ATOR_VIEWER,
  FakeContaRepo,
  FakeCategoriaRepo,
  FakeCustoFixoRepo,
  FakeProvisaoRepo,
  type FakeDeps,
} from './__fakes__/fakes-ciclo-fechamento';
import type { CustoFixo, PagamentoFixo, ProvisaoAnual } from '@/domain/model/entidades';
import {
  listarCustosFixos,
  desativarCustoFixo,
  reativarCustoFixo,
  excluirCustoFixo,
  CustoFixoEmUsoError,
  listarProvisoes,
  desativarProvisao,
  reativarProvisao,
  excluirProvisao,
  ProvisaoAcumuladaError,
} from './custos';
import { AcessoNegadoError } from '@/domain/auth/permissoes';

function custoFixoFake(patch: Partial<CustoFixo> = {}): CustoFixo {
  return {
    id: 'cf-1',
    nome: 'Academia',
    valorCents: 15_000,
    diaVencimento: 10,
    ativo: true,
    contaId: null,
    categoriaId: null,
    vigenteDe: null,
    vigenteAte: null,
    ...patch,
  };
}

function provisaoFake(patch: Partial<ProvisaoAnual> = {}): ProvisaoAnual {
  return {
    id: 'prov-1',
    nome: 'IPVA',
    valorAnualCents: 120_000,
    mesEsperado: 1,
    acumuladoCents: 0,
    ativo: true,
    ...patch,
  };
}

function pagamentoFake(patch: Partial<PagamentoFixo> = {}): PagamentoFixo {
  return { id: 'pgto-1', custoFixoId: 'cf-1', cicloId: 'c1', pagoEm: '2026-07-10', ...patch };
}

const CICLO_ABERTO = cicloFake({
  id: 'c1',
  dataInicio: '2026-07-05',
  dataFim: '2026-08-04',
  fechado: false,
});

function deps(opcoes: Parameters<typeof criarDeps>[0] = {}): FakeDeps {
  return criarDeps({ ator: ATOR_OWNER, ciclos: [CICLO_ABERTO], ...opcoes });
}

describe('listarCustosFixos', () => {
  it('inclui ativos e inativos', async () => {
    const d = deps({ custosFixos: [custoFixoFake({ id: 'cf-ativo' }), custoFixoFake({ id: 'cf-inativo', ativo: false })] });
    const custos = await listarCustosFixos(d);
    expect(custos.map((c) => c.id).sort()).toEqual(['cf-ativo', 'cf-inativo']);
  });
});

describe('excluirCustoFixo', () => {
  it('recusa quando há PagamentoFixo registrado, com o erro nomeado, e o custo continua existindo', async () => {
    const d = deps({
      custosFixos: [custoFixoFake()],
      pagamentosFixos: [pagamentoFake({ cicloId: 'c1' }), pagamentoFake({ id: 'pgto-2', cicloId: 'c-antigo' })],
    });

    await expect(excluirCustoFixo(d, 'cf-1')).rejects.toBeInstanceOf(CustoFixoEmUsoError);
    await expect(excluirCustoFixo(d, 'cf-1')).rejects.toThrow(/2 ciclo/);

    const restante = await d.custosFixos.obter('cf-1');
    expect(restante).not.toBeNull();
  });

  it('remove de fato quando não há nenhum pagamento registrado', async () => {
    const d = deps({ custosFixos: [custoFixoFake()] });

    await expect(excluirCustoFixo(d, 'cf-1')).resolves.toMatchObject({ recalculou: true });
    expect(await d.custosFixos.obter('cf-1')).toBeNull();
  });

  it('converte a violação de FK (backstop) no mesmo erro nomeado, sem deixar o erro cru vazar', async () => {
    const d = deps({ custosFixos: [custoFixoFake()] });
    // Simula a corrida: nenhum PagamentoFixo na checagem prévia, mas o banco
    // recusa a exclusão mesmo assim (FK Restrict / P2003).
    d.custosFixos.bloqueadosPorPagamento.add('cf-1');

    await expect(excluirCustoFixo(d, 'cf-1')).rejects.toBeInstanceOf(CustoFixoEmUsoError);
  });
});

describe('desativarCustoFixo', () => {
  it('deixa ativo === false e o custo some de listarAtivos mas continua em listarTodos', async () => {
    const d = deps({ custosFixos: [custoFixoFake({ ativo: true })] });

    await desativarCustoFixo(d, 'cf-1');

    const ativos = await d.custosFixos.listarAtivos();
    const todos = await d.custosFixos.listarTodos();
    expect(ativos).toHaveLength(0);
    expect(todos).toHaveLength(1);
    expect(todos[0]?.ativo).toBe(false);
  });
});

/**
 * Reativar é o retorno prometido pela confirmação de desativar ("dá para
 * reativar quando quiser"). Sem estes casos de uso, a UI prometia uma ação que
 * o sistema não entregava.
 */
describe('reativarCustoFixo', () => {
  // Ciclo coerente com o custo DESATIVADO: fixos zerados e verba cheia
  // (800.000 renda − 100.000 poupança).
  const CICLO_SEM_O_CUSTO = cicloFake({
    id: 'c1',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    fechado: false,
    fixosCents: 0,
    verbaVariavelCents: 700_000,
  });
  const CUSTO_INATIVO = custoFixoFake({ valorCents: 15_000, ativo: false });

  it('devolve o custo a listarAtivos e ele volta a contar em fixosCents', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_SEM_O_CUSTO],
      custosFixos: [CUSTO_INATIVO],
    });

    await reativarCustoFixo(d, 'cf-1');

    const ativos = await d.custosFixos.listarAtivos();
    expect(ativos).toHaveLength(1);
    expect(ativos[0]?.id).toBe('cf-1');
    expect((await d.ciclos.obter('c1'))?.fixosCents).toBe(15_000);
  });

  it('ciclo SEM gasto nenhum: recalcula e devolve verba antes e depois', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_SEM_O_CUSTO],
      custosFixos: [CUSTO_INATIVO],
    });

    const efeito = await reativarCustoFixo(d, 'cf-1');

    expect(efeito.recalculou).toBe(true);
    if (!efeito.recalculou) throw new Error('inalcançável — guarda para estreitar a união');
    expect(efeito.verbaAntesCents).toBe(700_000);
    // Com o custo de R$ 150,00 de volta, a verba cai na mesma medida.
    expect(efeito.ciclo.verbaCents).toBe(685_000);
    expect((await d.ciclos.obter('c1'))?.verbaVariavelCents).toBe(685_000);
  });

  it('ciclo COM gasto lançado: não recalcula e devolve a verba intacta + a data do próximo ciclo', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_SEM_O_CUSTO],
      custosFixos: [CUSTO_INATIVO],
      transacoes: [transacaoFake({ id: 'tx-1', cicloId: 'c1', data: '2026-07-10' })],
    });

    const efeito = await reativarCustoFixo(d, 'cf-1');

    expect(efeito.recalculou).toBe(false);
    expect(efeito.ciclo).toEqual({
      inicio: '2026-07-05',
      fim: '2026-08-04',
      proximoInicio: '2026-08-05',
      verbaCents: 700_000,
    });
    // O congelamento vale nos dois sentidos: reativar não reescreve o ciclo.
    expect((await d.ciclos.obter('c1'))?.verbaVariavelCents).toBe(700_000);
    // Mas o cadastro mudou — é o próximo ciclo que nasce com o custo.
    expect((await d.custosFixos.obter('cf-1'))?.ativo).toBe(true);
  });

  it('recusa quem não pode escrever, sem tocar no cadastro', async () => {
    const d = criarDeps({
      ator: ATOR_VIEWER,
      ciclos: [CICLO_SEM_O_CUSTO],
      custosFixos: [CUSTO_INATIVO],
    });

    await expect(reativarCustoFixo(d, 'cf-1')).rejects.toBeInstanceOf(AcessoNegadoError);
    expect((await d.custosFixos.obter('cf-1'))?.ativo).toBe(false);
  });
});

describe('listarProvisoes', () => {
  it('inclui ativas e inativas', async () => {
    const d = deps({ provisoes: [provisaoFake({ id: 'p-ativa' }), provisaoFake({ id: 'p-inativa', ativo: false })] });
    const provisoes = await listarProvisoes(d);
    expect(provisoes.map((p) => p.id).sort()).toEqual(['p-ativa', 'p-inativa']);
  });
});

describe('excluirProvisao', () => {
  it('recusa quando acumuladoCents > 0, e o acumulado segue intacto', async () => {
    const d = deps({ provisoes: [provisaoFake({ acumuladoCents: 50_000 })] });

    await expect(excluirProvisao(d, 'prov-1')).rejects.toBeInstanceOf(ProvisaoAcumuladaError);

    const restante = await d.provisoes.obter('prov-1');
    expect(restante?.acumuladoCents).toBe(50_000);
  });

  it('remove de fato quando o acumulado é zero', async () => {
    const d = deps({ provisoes: [provisaoFake({ acumuladoCents: 0 })] });

    await expect(excluirProvisao(d, 'prov-1')).resolves.toMatchObject({ recalculou: true });
    expect(await d.provisoes.obter('prov-1')).toBeNull();
  });
});

describe('desativarProvisao', () => {
  it('deixa ativo === false e a provisão some de listarAtivas mas continua em listarTodas', async () => {
    const d = deps({ provisoes: [provisaoFake({ ativo: true })] });

    await desativarProvisao(d, 'prov-1');

    const ativas = await d.provisoes.listarAtivas();
    const todas = await d.provisoes.listarTodas();
    expect(ativas).toHaveLength(0);
    expect(todas).toHaveLength(1);
    expect(todas[0]?.ativo).toBe(false);
  });
});

describe('reativarProvisao', () => {
  // Provisão desativada de R$ 1.200,00/ano = R$ 100,00/mês; o ciclo abaixo
  // ainda não a conta.
  const CICLO_SEM_A_PROVISAO = cicloFake({
    id: 'c1',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    fechado: false,
    provisaoMensalCents: 0,
    verbaVariavelCents: 700_000,
  });
  const PROVISAO_INATIVA = provisaoFake({ valorAnualCents: 120_000, ativo: false });

  it('devolve a provisão a listarAtivas e ela volta a contar na provisão mensal', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_SEM_A_PROVISAO],
      provisoes: [PROVISAO_INATIVA],
    });

    await reativarProvisao(d, 'prov-1');

    expect(await d.provisoes.listarAtivas()).toHaveLength(1);
    expect((await d.ciclos.obter('c1'))?.provisaoMensalCents).toBe(10_000);
  });

  it('ciclo SEM gasto nenhum: recalcula e devolve verba antes e depois', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_SEM_A_PROVISAO],
      provisoes: [PROVISAO_INATIVA],
    });

    const efeito = await reativarProvisao(d, 'prov-1');

    expect(efeito.recalculou).toBe(true);
    if (!efeito.recalculou) throw new Error('inalcançável — guarda para estreitar a união');
    expect(efeito.verbaAntesCents).toBe(700_000);
    expect(efeito.ciclo.verbaCents).toBe(690_000);
  });

  it('ciclo COM gasto lançado: não recalcula e a verba do ciclo segue congelada', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_SEM_A_PROVISAO],
      provisoes: [PROVISAO_INATIVA],
      transacoes: [transacaoFake({ id: 'tx-1', cicloId: 'c1', data: '2026-07-10' })],
    });

    const efeito = await reativarProvisao(d, 'prov-1');

    expect(efeito.recalculou).toBe(false);
    expect(efeito.ciclo).toEqual({
      inicio: '2026-07-05',
      fim: '2026-08-04',
      proximoInicio: '2026-08-05',
      verbaCents: 700_000,
    });
    expect((await d.ciclos.obter('c1'))?.verbaVariavelCents).toBe(700_000);
  });

  it('não mexe no acumulado, que seguiu existindo enquanto ela estava desativada', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_SEM_A_PROVISAO],
      provisoes: [provisaoFake({ ativo: false, acumuladoCents: 50_000 })],
    });

    await reativarProvisao(d, 'prov-1');

    expect((await d.provisoes.obter('prov-1'))?.acumuladoCents).toBe(50_000);
  });

  it('recusa quem não pode escrever, sem tocar no cadastro', async () => {
    const d = criarDeps({
      ator: ATOR_VIEWER,
      ciclos: [CICLO_SEM_A_PROVISAO],
      provisoes: [PROVISAO_INATIVA],
    });

    await expect(reativarProvisao(d, 'prov-1')).rejects.toBeInstanceOf(AcessoNegadoError);
    expect((await d.provisoes.obter('prov-1'))?.ativo).toBe(false);
  });
});

describe('R1 — passado é congelado', () => {
  it('excluir um custo fixo não altera Ciclo.fixosCents de um ciclo já fechado', async () => {
    const cicloFechado = cicloFake({
      id: 'c-fechado',
      dataInicio: '2026-05-05',
      dataFim: '2026-06-04',
      fechado: true,
      fechadoEm: '2026-06-05',
      fixosCents: 200_000,
    });
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_ABERTO, cicloFechado],
      custosFixos: [custoFixoFake()],
    });

    await excluirCustoFixo(d, 'cf-1');

    const depois = await d.ciclos.obter('c-fechado');
    expect(depois?.fixosCents).toBe(200_000);
  });

  it('desativar um custo fixo não altera Ciclo.fixosCents de um ciclo já fechado', async () => {
    const cicloFechado = cicloFake({
      id: 'c-fechado',
      dataInicio: '2026-05-05',
      dataFim: '2026-06-04',
      fechado: true,
      fechadoEm: '2026-06-05',
      fixosCents: 200_000,
    });
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_ABERTO, cicloFechado],
      custosFixos: [custoFixoFake()],
    });

    await desativarCustoFixo(d, 'cf-1');

    const depois = await d.ciclos.obter('c-fechado');
    expect(depois?.fixosCents).toBe(200_000);
  });

  it('excluir uma provisão não altera Ciclo.provisaoMensalCents de um ciclo já fechado', async () => {
    const cicloFechado = cicloFake({
      id: 'c-fechado',
      dataInicio: '2026-05-05',
      dataFim: '2026-06-04',
      fechado: true,
      fechadoEm: '2026-06-05',
      provisaoMensalCents: 10_000,
    });
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_ABERTO, cicloFechado],
      provisoes: [provisaoFake({ acumuladoCents: 0 })],
    });

    await excluirProvisao(d, 'prov-1');

    const depois = await d.ciclos.obter('c-fechado');
    expect(depois?.provisaoMensalCents).toBe(10_000);
  });

  it('um ciclo fechado, VAZIO e que cobre "hoje" não é recalculado por desativar/excluir/upsert de custo fixo', async () => {
    // Este é o cenário do achado 1: `obterAtual(hoje)` devolve o ciclo
    // fechado (ele cobre "hoje"), e como não tem Transacao a antiga guarda de
    // `recalcularCicloAtualSeVazio` ("vazio -> pode recalcular") o alcançava e
    // reescrevia `fixosCents`. A guarda correta é "fechado nunca, vazio ou não".
    const cicloFechadoCobreHoje = cicloFake({
      id: 'c-fechado-hoje',
      dataInicio: '2026-07-05',
      dataFim: '2026-08-04',
      fechado: true,
      fechadoEm: '2026-08-01',
      fixosCents: 200_000,
    });
    const custo = custoFixoFake();
    const d = criarDeps({
      ator: ATOR_OWNER,
      hoje: '2026-07-20', // dentro do intervalo do ciclo fechado acima
      ciclos: [cicloFechadoCobreHoje],
      custosFixos: [custo],
    });

    await desativarCustoFixo(d, 'cf-1');
    expect((await d.ciclos.obter('c-fechado-hoje'))?.fixosCents).toBe(200_000);

    await excluirCustoFixo(d, 'cf-1');
    expect((await d.ciclos.obter('c-fechado-hoje'))?.fixosCents).toBe(200_000);
  });
});

describe('achado 2 — fakes de salvar() não podem colidir em id vazio', () => {
  it('FakeCustoFixoRepo.salvar: dois custos fixos novos (id: "") viram dois itens com ids distintos', async () => {
    const repo = new FakeCustoFixoRepo();

    const primeiro = await repo.salvar(custoFixoFake({ id: '' }));
    const segundo = await repo.salvar(custoFixoFake({ id: '', nome: 'Streaming' }));

    expect(primeiro.id).not.toBe('');
    expect(segundo.id).not.toBe('');
    expect(primeiro.id).not.toBe(segundo.id);
    expect(await repo.listarTodos()).toHaveLength(2);
  });

  it('FakeProvisaoRepo.salvar: duas provisões novas (id: "") viram dois itens com ids distintos', async () => {
    const repo = new FakeProvisaoRepo();

    const primeira = await repo.salvar(provisaoFake({ id: '' }));
    const segunda = await repo.salvar(provisaoFake({ id: '', nome: 'Seguro' }));

    expect(primeira.id).not.toBe(segunda.id);
    expect(await repo.listarTodas()).toHaveLength(2);
  });

  it('FakeContaRepo.salvar: duas contas novas (id: "") viram dois itens com ids distintos', async () => {
    const repo = new FakeContaRepo();

    const primeira = await repo.salvar(contaFake({ id: '' }));
    const segunda = await repo.salvar(contaFake({ id: '', nome: 'CDB' }));

    expect(primeira.id).not.toBe(segunda.id);
    expect(await repo.listar({ incluirArquivadas: true })).toHaveLength(2);
  });

  it('FakeCategoriaRepo.salvar: duas categorias novas (id: "") viram dois itens com ids distintos', async () => {
    const repo = new FakeCategoriaRepo();
    const categoriaBase = {
      nome: 'Lazer',
      grupo: 'VARIAVEL' as const,
      essencial: false,
      icone: null,
      cor: null,
      ordem: 1,
    };

    const primeira = await repo.salvar({ id: '', ...categoriaBase });
    const segunda = await repo.salvar({ id: '', ...categoriaBase, nome: 'Saúde' });

    expect(primeira.id).not.toBe(segunda.id);
    expect(await repo.listar()).toHaveLength(2);
  });
});

/**
 * TASKS-CUSTOS §4.3 item 0. A frase mostrada ao dono depende de um fato que só
 * o servidor conhece: `recalcularCicloAtualSeVazio` recalculou ou não o ciclo
 * em curso. Dizer "vale a partir do próximo ciclo" quando ele recalculou é
 * mentira — e ele recalcula justamente no dia 1, quando o dono está arrumando
 * os custos.
 */
describe('efeito no ciclo atual — a mensagem é bifurcada', () => {
  const CUSTO = custoFixoFake({ valorCents: 15_000 });
  // Ciclo coerente com o custo acima: fixos 15.000 e verba já descontada
  // (800.000 renda − 100.000 poupança − 15.000 fixos).
  const CICLO_COM_CUSTO = cicloFake({
    id: 'c1',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    fechado: false,
    fixosCents: 15_000,
    verbaVariavelCents: 685_000,
  });

  it('ciclo COM gasto lançado: não recalcula e devolve a verba intacta + a data do próximo ciclo', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_COM_CUSTO],
      custosFixos: [CUSTO],
      transacoes: [transacaoFake({ id: 'tx-1', cicloId: 'c1', data: '2026-07-10' })],
    });

    const efeito = await desativarCustoFixo(d, 'cf-1');

    expect(efeito.recalculou).toBe(false);
    // A verba do ciclo é a de sempre — o congelamento foi respeitado.
    expect(efeito.ciclo).toEqual({
      inicio: '2026-07-05',
      fim: '2026-08-04',
      proximoInicio: '2026-08-05',
      verbaCents: 685_000,
    });
    expect((await d.ciclos.obter('c1'))?.verbaVariavelCents).toBe(685_000);
  });

  it('ciclo SEM gasto nenhum: recalcula e devolve verba antes e depois', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_COM_CUSTO],
      custosFixos: [CUSTO],
    });

    const efeito = await desativarCustoFixo(d, 'cf-1');

    expect(efeito.recalculou).toBe(true);
    if (!efeito.recalculou) throw new Error('inalcançável — guarda para estreitar a união');
    expect(efeito.verbaAntesCents).toBe(685_000);
    // Sem o custo de R$ 150,00, a verba sobe para renda − poupança.
    expect(efeito.ciclo.verbaCents).toBe(700_000);
    expect(efeito.ciclo.proximoInicio).toBe('2026-08-05');
    expect((await d.ciclos.obter('c1'))?.verbaVariavelCents).toBe(700_000);
  });

  it('excluir também devolve o efeito, pelo mesmo caminho', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [CICLO_COM_CUSTO],
      custosFixos: [CUSTO],
    });

    const efeito = await excluirCustoFixo(d, 'cf-1');

    expect(efeito.recalculou).toBe(true);
    if (!efeito.recalculou) throw new Error('inalcançável — guarda para estreitar a união');
    expect(efeito.verbaAntesCents).toBe(685_000);
    expect(efeito.ciclo.verbaCents).toBe(700_000);
  });

  it('sem ciclo aberto nenhum: não recalcula e não inventa um período', async () => {
    const d = criarDeps({ ator: ATOR_OWNER, ciclos: [], custosFixos: [CUSTO] });

    const efeito = await desativarCustoFixo(d, 'cf-1');

    expect(efeito).toEqual({ recalculou: false, ciclo: null });
  });

  it('provisão segue o mesmo contrato', async () => {
    const d = criarDeps({
      ator: ATOR_OWNER,
      ciclos: [cicloFake({ id: 'c1', fechado: false, provisaoMensalCents: 10_000, verbaVariavelCents: 690_000 })],
      provisoes: [provisaoFake({ valorAnualCents: 120_000, acumuladoCents: 0 })],
    });

    const efeito = await desativarProvisao(d, 'prov-1');

    expect(efeito.recalculou).toBe(true);
    if (!efeito.recalculou) throw new Error('inalcançável — guarda para estreitar a união');
    expect(efeito.verbaAntesCents).toBe(690_000);
    expect(efeito.ciclo.verbaCents).toBe(700_000);
  });
});
