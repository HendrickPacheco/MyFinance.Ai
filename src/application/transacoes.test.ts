/**
 * Testes de casos de uso de transações (SPEC regras 5 e 9). Cobre a guarda de
 * retroatividade — editar/excluir/estornar uma transação de ciclo fechado
 * exige confirmação explícita e recalcula a sobra daquele ciclo — e a regra
 * do estorno (abate na data da transação original quando ela existe, senão
 * na data do estorno). Usa fakes em memória das portas; nunca toca no banco.
 */
import { describe, it, expect } from 'vitest';
import {
  criarDeps as criarDepsFake,
  cicloFake,
  transacaoFake,
  type FakeDeps,
  type OpcoesFakeDeps,
} from './__fakes__/fakes-ciclo-fechamento';
import {
  editarTransacao,
  excluirTransacao,
  estornarTransacao,
  CicloFechadoError,
} from './transacoes';

const CICLO_FECHADO_ID = 'ciclo-fechado';
const CICLO_ABERTO_ID = 'ciclo-aberto';

function cicloFechadoFake(patch: Partial<ReturnType<typeof cicloFake>> = {}) {
  return cicloFake({
    id: CICLO_FECHADO_ID,
    dataInicio: '2026-06-05',
    dataFim: '2026-07-04',
    verbaVariavelCents: 100_000, // R$ 1.000,00
    fechado: true,
    fechadoEm: '2026-07-05',
    sobraCents: 40_000, // valor propositalmente desatualizado — deve ser recalculado
    ...patch,
  });
}

function cicloAbertoFake(patch: Partial<ReturnType<typeof cicloFake>> = {}) {
  return cicloFake({
    id: CICLO_ABERTO_ID,
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    verbaVariavelCents: 100_000,
    fechado: false,
    fechadoEm: null,
    sobraCents: null,
    ...patch,
  });
}

/** Deps com um ciclo fechado (jun) e um ciclo aberto (jul), hoje = 2026-07-20. */
function fixture(transacoesIniciais: OpcoesFakeDeps['transacoes'] = []): FakeDeps {
  return criarDepsFake({
    hoje: '2026-07-20',
    ciclos: [cicloFechadoFake(), cicloAbertoFake()],
    transacoes: transacoesIniciais,
  });
}

describe('editarTransacao — guarda de retroatividade (SPEC regra 9)', () => {
  it('bloqueia edição de transação de ciclo fechado sem confirmação, sem alterar nada', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-06-10', valorCents: 30_000, cicloId: CICLO_FECHADO_ID }),
    ]);

    await expect(editarTransacao(deps, 'tx-1', { valorCents: 50_000 })).rejects.toThrow(
      CicloFechadoError,
    );

    const tx = await deps.transacoes.obter('tx-1');
    expect(tx?.valorCents).toBe(30_000); // nada foi alterado
    const ciclo = await deps.ciclos.obter(CICLO_FECHADO_ID);
    expect(ciclo?.sobraCents).toBe(40_000); // sobra não recalculada
  });

  it('permite a edição quando confirmarRetroativo=true e persiste o novo valor', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-06-10', valorCents: 30_000, cicloId: CICLO_FECHADO_ID }),
    ]);

    const editada = await editarTransacao(deps, 'tx-1', {
      valorCents: 50_000,
      confirmarRetroativo: true,
    });

    expect(editada.valorCents).toBe(50_000);
  });

  it('recalcula corretamente a sobra do ciclo fechado após a edição confirmada', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-06-10', valorCents: 30_000, cicloId: CICLO_FECHADO_ID }),
    ]);

    await editarTransacao(deps, 'tx-1', { valorCents: 50_000, confirmarRetroativo: true });

    const ciclo = await deps.ciclos.obter(CICLO_FECHADO_ID);
    // verbaVariavelCents (100.000) - gastoRealizado (50.000) = 50.000
    expect(ciclo?.sobraCents).toBe(50_000);
  });

  it('bloqueia edição que MOVE a transação de um ciclo aberto para um fechado', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-2', data: '2026-07-10', valorCents: 20_000, cicloId: CICLO_ABERTO_ID }),
    ]);

    // Muda a data para dentro do ciclo já fechado (jun) — mesmo a origem
    // estando aberta, o destino fechado exige confirmação.
    await expect(
      editarTransacao(deps, 'tx-2', { valorCents: 20_000, data: '2026-06-15' }),
    ).rejects.toThrow(CicloFechadoError);

    const tx = await deps.transacoes.obter('tx-2');
    expect(tx?.data).toBe('2026-07-10'); // nada foi alterado
    expect(tx?.cicloId).toBe(CICLO_ABERTO_ID);
  });

  it('confirmada, a mudança de ciclo religa a transação e recalcula a sobra do ciclo fechado de destino', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-06-10', valorCents: 30_000, cicloId: CICLO_FECHADO_ID }),
      transacaoFake({ id: 'tx-2', data: '2026-07-10', valorCents: 20_000, cicloId: CICLO_ABERTO_ID }),
    ]);

    const movida = await editarTransacao(deps, 'tx-2', {
      valorCents: 20_000,
      data: '2026-06-15',
      confirmarRetroativo: true,
    });

    expect(movida.cicloId).toBe(CICLO_FECHADO_ID);

    const cicloFechado = await deps.ciclos.obter(CICLO_FECHADO_ID);
    // Agora o ciclo fechado tem tx-1 (30.000) + tx-2 (20.000) = 50.000 de gasto.
    // sobra = 100.000 - 50.000 = 50.000
    expect(cicloFechado?.sobraCents).toBe(50_000);
  });
});

describe('excluirTransacao — guarda de retroatividade (SPEC regra 9)', () => {
  it('bloqueia exclusão de transação de ciclo fechado sem confirmação', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-06-10', valorCents: 30_000, cicloId: CICLO_FECHADO_ID }),
    ]);

    await expect(excluirTransacao(deps, 'tx-1')).rejects.toThrow(CicloFechadoError);
    expect(await deps.transacoes.obter('tx-1')).not.toBeNull();
  });

  it('confirmada, exclui e recalcula a sobra do ciclo fechado', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-06-10', valorCents: 30_000, cicloId: CICLO_FECHADO_ID }),
    ]);

    await excluirTransacao(deps, 'tx-1', true);

    expect(await deps.transacoes.obter('tx-1')).toBeNull();
    const ciclo = await deps.ciclos.obter(CICLO_FECHADO_ID);
    // Sem nenhum gasto restante: sobra = verbaVariavelCents inteira.
    expect(ciclo?.sobraCents).toBe(100_000);
  });
});

describe('estornarTransacao — data do estorno (SPEC regra 5 / seção 9)', () => {
  it('abate na data da transação original quando ela existe', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-07-10', valorCents: 30_000, cicloId: CICLO_ABERTO_ID }),
    ]);

    const estorno = await estornarTransacao(deps, 'tx-1');

    expect(estorno.data).toBe('2026-07-10'); // data da transação original
    expect(estorno.tipo).toBe('ESTORNO');
    expect(estorno.estornoDeId).toBe('tx-1');
  });

  it('abate na data do estorno quando a transação original não existe', async () => {
    const deps = fixture([]);

    const estorno = await estornarTransacao(deps, 'tx-inexistente', 15_000);

    expect(estorno.data).toBe(deps.relogio.hoje()); // hoje = 2026-07-20 (RelogioFixo)
    expect(estorno.valorCents).toBe(15_000);
  });

  it('bloqueia estorno de transação de ciclo fechado sem confirmação', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-06-10', valorCents: 30_000, cicloId: CICLO_FECHADO_ID }),
    ]);

    await expect(estornarTransacao(deps, 'tx-1')).rejects.toThrow(CicloFechadoError);
  });

  it('confirmado, estorna e recalcula a sobra do ciclo fechado (devolve o gasto)', async () => {
    const deps = fixture([
      transacaoFake({ id: 'tx-1', data: '2026-06-10', valorCents: 30_000, cicloId: CICLO_FECHADO_ID }),
    ]);

    await estornarTransacao(deps, 'tx-1', undefined, undefined, true);

    const ciclo = await deps.ciclos.obter(CICLO_FECHADO_ID);
    // gasto líquido = 30.000 (despesa) - 30.000 (estorno) = 0 -> sobra = verba inteira.
    expect(ciclo?.sobraCents).toBe(100_000);
  });
});
