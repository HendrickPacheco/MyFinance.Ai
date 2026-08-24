/**
 * Prova de que a autorização mora na CAMADA DE APLICAÇÃO, não só na UI nem só
 * no middleware (TASKS-AUTH §2.3). Cada caso de uso de escrita é chamado com
 * um ator VIEWER e precisa (a) lançar `AcessoNegadoError` e (b) não deixar
 * NENHUMA escrita chegar ao repositório.
 *
 * O (b) é o que importa: um teste que só verifica a exceção passaria mesmo se
 * a trava estivesse depois do primeiro `salvar`.
 */
import { describe, expect, it } from 'vitest';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import { ATOR_ANONIMO } from '@/domain/auth/ator';
import {
  criarDeps,
  cicloFake,
  transacaoFake,
  CATEGORIA_VARIAVEL,
  ATOR_VIEWER,
  ATOR_OWNER,
  type FakeDeps,
} from './__fakes__/fakes-ciclo-fechamento';
import {
  criarTransacao,
  criarParcelamento,
  editarTransacao,
  excluirTransacao,
  estornarTransacao,
} from './transacoes';
import { encerrarParcelamento, editarParcelamento } from './parcelamentos';
import { garantirCicloAtual, puxarDaReserva, recalcularCicloAtual } from './ciclos';
import { fecharCiclo } from './fechamento';
import {
  atualizarConfig,
  upsertCategoria,
  upsertConta,
  upsertCustoFixo,
  upsertProvisao,
} from './config';
import {
  desativarCustoFixo,
  reativarCustoFixo,
  excluirCustoFixo,
  desativarProvisao,
  reativarProvisao,
  excluirProvisao,
} from './custos';
import { criarSnapshot, aceitarRealidade } from './patrimonio';
import {
  desmarcarCustoFixoPago,
  desmarcarParcelaPaga,
  marcarCustoFixoPago,
  marcarParcelaPaga,
} from './pagamentos';
import { CONFIG_PADRAO } from './__fakes__/fakes-ciclo-fechamento';

const CICLO = cicloFake({ id: 'c1', dataInicio: '2026-07-05', dataFim: '2026-08-04' });
const TX = transacaoFake({ id: 'tx-1', cicloId: 'c1', categoriaId: CATEGORIA_VARIAVEL.id });
const PARCELAMENTO = {
  id: 'parc-1',
  descricao: 'Notebook',
  valorTotalCents: 120_000,
  numParcelas: 12,
  dataCompra: '2026-07-05',
  categoriaId: CATEGORIA_VARIAVEL.id,
  encerradoEm: null,
};
const PARCELA = transacaoFake({
  id: 'parcela-1',
  cicloId: 'c1',
  categoriaId: CATEGORIA_VARIAVEL.id,
  parcelamentoId: 'parc-1',
  parcelaNum: 1,
});
const CUSTO_FIXO = {
  id: 'cf-1',
  nome: 'Luz',
  valorCents: 10_000,
  diaVencimento: 10,
  ativo: true,
  contaId: null,
  categoriaId: null,
  vigenteDe: null,
  vigenteAte: null,
};
const PROVISAO = {
  id: 'prov-1',
  nome: 'IPVA',
  valorAnualCents: 120_000,
  mesEsperado: 1,
  acumuladoCents: 0,
  ativo: true,
};

function deps(ator = ATOR_VIEWER): FakeDeps {
  const d = criarDeps({
    ator,
    ciclos: [CICLO],
    transacoes: [TX, PARCELA],
    custosFixos: [CUSTO_FIXO],
    provisoes: [PROVISAO],
  });
  d.parcelamentos.itens.push(PARCELAMENTO);
  return d;
}

/** Fotografia do estado gravável, para provar que nada mudou. */
async function fotografar(d: FakeDeps) {
  return JSON.stringify({
    transacoes: await d.transacoes.listarPorCiclo('c1'),
    parcelas: await d.transacoes.listarPorParcelamento('parc-1'),
    parcelamentos: await d.parcelamentos.listar(),
    ciclos: await d.ciclos.obter('c1'),
    config: await d.config.obter(),
    custosFixos: await d.custosFixos.listarTodos(),
    provisoes: await d.provisoes.listarTodas(),
  });
}

/** Cada entrada: nome + invocação do caso de uso de escrita. */
const ESCRITAS: ReadonlyArray<readonly [string, (d: FakeDeps) => Promise<unknown>]> = [
  ['criarTransacao', (d) => criarTransacao(d, { valorCents: 1000, categoriaId: CATEGORIA_VARIAVEL.id })],
  [
    'criarParcelamento',
    (d) =>
      criarParcelamento(d, {
        descricao: 'TV',
        valorTotalCents: 120_000,
        numParcelas: 12,
        categoriaId: CATEGORIA_VARIAVEL.id,
      }),
  ],
  ['editarTransacao', (d) => editarTransacao(d, 'tx-1', { valorCents: 5000, categoriaId: CATEGORIA_VARIAVEL.id })],
  ['excluirTransacao', (d) => excluirTransacao(d, 'tx-1')],
  ['estornarTransacao', (d) => estornarTransacao(d, 'tx-1', 1000)],
  ['encerrarParcelamento', (d) => encerrarParcelamento(d, 'parc-1')],
  ['editarParcelamento', (d) => editarParcelamento(d, 'parc-1', { descricao: 'Novo nome' })],
  ['recalcularCicloAtual', (d) => recalcularCicloAtual(d)],
  ['puxarDaReserva', (d) => puxarDaReserva(d, 10_000)],
  ['fecharCiclo', (d) => fecharCiclo(d, 'c1', { rendaRealizadaCents: 800_000 })],
  ['atualizarConfig', (d) => atualizarConfig(d, { ...CONFIG_PADRAO })],
  ['upsertConta', (d) => upsertConta(d, { id: '', nome: 'X', tipo: 'VARIAVEL', saldoCents: 0, incluiPatrimonio: true, arquivada: false })],
  [
    'upsertCustoFixo',
    (d) =>
      upsertCustoFixo(d, {
        id: '',
        nome: 'Luz',
        valorCents: 10_000,
        diaVencimento: 10,
        ativo: true,
        contaId: null,
        categoriaId: null,
        vigenteDe: null,
        vigenteAte: null,
      }),
  ],
  [
    'upsertProvisao',
    (d) =>
      upsertProvisao(d, {
        id: '',
        nome: 'IPVA',
        valorAnualCents: 120_000,
        mesEsperado: 1,
        acumuladoCents: 0,
        ativo: true,
      }),
  ],
  [
    'upsertCategoria',
    (d) => upsertCategoria(d, { id: '', nome: 'Nova', grupo: 'VARIAVEL', essencial: false, icone: null, cor: null, ordem: 9 }),
  ],
  ['criarSnapshot', (d) => criarSnapshot(d, '2026-08-01', [{ nome: 'CDB', classe: 'RENDA_FIXA', valorCents: 100 }])],
  ['aceitarRealidade', (d) => aceitarRealidade(d, 'item-1')],
  ['desativarCustoFixo', (d) => desativarCustoFixo(d, 'cf-1')],
  ['reativarCustoFixo', (d) => reativarCustoFixo(d, 'cf-1')],
  ['excluirCustoFixo', (d) => excluirCustoFixo(d, 'cf-1')],
  ['desativarProvisao', (d) => desativarProvisao(d, 'prov-1')],
  ['reativarProvisao', (d) => reativarProvisao(d, 'prov-1')],
  ['excluirProvisao', (d) => excluirProvisao(d, 'prov-1')],
  ['marcarCustoFixoPago', (d) => marcarCustoFixoPago(d, 'cf-1')],
  ['desmarcarCustoFixoPago', (d) => desmarcarCustoFixoPago(d, 'cf-1')],
  ['marcarParcelaPaga', (d) => marcarParcelaPaga(d, 'tx-1')],
  ['desmarcarParcelaPaga', (d) => desmarcarParcelaPaga(d, 'tx-1')],
];

describe.each(ESCRITAS)('%s — VIEWER não escreve', (_nome, executar) => {
  it('lança AcessoNegadoError', async () => {
    await expect(executar(deps())).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('não deixa nenhuma escrita chegar ao repositório', async () => {
    const d = deps();
    const antes = await fotografar(d);
    await executar(d).catch(() => undefined);
    expect(await fotografar(d)).toBe(antes);
  });

  it('também barra o ator anônimo', async () => {
    await expect(executar(deps(ATOR_ANONIMO))).rejects.toBeInstanceOf(AcessoNegadoError);
  });
});

describe('OWNER continua escrevendo normalmente', () => {
  it('cria transação', async () => {
    const d = deps(ATOR_OWNER);
    const t = await criarTransacao(d, {
      valorCents: 2500,
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    expect(t.valorCents).toBe(2500);
  });

  it('edita e exclui transação', async () => {
    const d = deps(ATOR_OWNER);
    const editada = await editarTransacao(d, 'tx-1', {
      valorCents: 7777,
      categoriaId: CATEGORIA_VARIAVEL.id,
    });
    expect(editada.valorCents).toBe(7777);

    await expect(excluirTransacao(d, 'tx-1')).resolves.toBeUndefined();
  });

  it('salva conta', async () => {
    const d = deps(ATOR_OWNER);
    const conta = await upsertConta(d, {
      id: '',
      nome: 'Reserva',
      tipo: 'RESERVA',
      saldoCents: 0,
      incluiPatrimonio: true,
      arquivada: false,
    });
    expect(conta.nome).toBe('Reserva');
  });
});

describe('garantirCicloAtual — exceção de sistema documentada', () => {
  it('cria o ciclo mesmo para VIEWER (senão o VIEWER não abriria nenhuma tela)', async () => {
    const d = criarDeps({ ator: ATOR_VIEWER, hoje: '2026-07-20' });
    const { ciclo } = await garantirCicloAtual(d);
    expect(ciclo).toBeTruthy();
  });

  it('vale até para o anônimo — o layout a chama antes de qualquer redirect', async () => {
    const d = criarDeps({ ator: ATOR_ANONIMO, hoje: '2026-07-20' });
    await expect(garantirCicloAtual(d)).resolves.toBeTruthy();
  });
});
