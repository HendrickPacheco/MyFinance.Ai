/**
 * Variantes read-only dos read-models (tarefa D1.5).
 *
 * O copiloto é read-only por decisão (D-8) e por trava (nº 5: nada grava sem
 * confirmação humana). Os read-models das telas passam por
 * `garantirCicloAtual`, que CRIA o ciclo quando falta — então responder uma
 * pergunta na virada de ciclo abriria um ciclo pela porta do chat.
 *
 * Estes testes provam as duas metades do contrato:
 *  · a variante read-only não grava nada e devolve `null` sem ciclo aberto;
 *  · a variante das telas continua criando o ciclo, como sempre fez.
 */
import { describe, expect, it } from 'vitest';
import { criarDeps, cicloFake, transacaoFake, type FakeDeps } from './__fakes__/fakes-ciclo-fechamento';
import { ConfigAusenteError, garantirCicloAtual, lerCicloAtual } from './ciclos';
import { obterEstadoHoje, obterEstadoHojeSomenteLeitura } from './hoje';
import { obterEstadoCiclo, obterEstadoCicloSomenteLeitura } from './ciclo-view';
import { obterEstadoPainel, obterEstadoPainelSomenteLeitura } from './dashboard';

const HOJE = '2026-07-20';

/** Ciclo cobrindo HOJE com o diaRecebimento 5 da CONFIG_PADRAO. */
function cicloAtual() {
  return cicloFake({ id: 'ciclo-atual', dataInicio: '2026-07-05', dataFim: '2026-08-04' });
}

/** Fotografa o estado dos fakes para provar que nada foi escrito. */
function fotografar(deps: FakeDeps): string {
  return JSON.stringify({
    ciclos: deps.ciclos.itens,
    transacoes: deps.transacoes.itens,
    contas: deps.contas.itens,
    pagamentos: deps.pagamentosFixos.itens,
  });
}

describe('lerCicloAtual', () => {
  it('devolve null quando não há ciclo aberto, sem criar nenhum', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [] });
    const antes = fotografar(deps);

    expect(await lerCicloAtual(deps)).toBeNull();

    expect(fotografar(deps)).toBe(antes);
    expect(deps.ciclos.criarChamadas).toBe(0);
  });

  it('devolve o ciclo que cobre hoje', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [cicloAtual()] });

    const resolvido = await lerCicloAtual(deps);

    expect(resolvido?.ciclo.id).toBe('ciclo-atual');
    expect(deps.ciclos.criarChamadas).toBe(0);
  });

  it('aponta o ciclo anterior não fechado como pendência', async () => {
    const anterior = cicloFake({
      id: 'ciclo-anterior',
      dataInicio: '2026-06-05',
      dataFim: '2026-07-04',
      fechado: false,
    });
    const deps = criarDeps({ hoje: HOJE, ciclos: [anterior, cicloAtual()] });

    const resolvido = await lerCicloAtual(deps);

    expect(resolvido?.pendenciaFechamento?.id).toBe('ciclo-anterior');
  });

  it('não aponta pendência quando o anterior já está fechado', async () => {
    const anterior = cicloFake({
      id: 'ciclo-anterior',
      dataInicio: '2026-06-05',
      dataFim: '2026-07-04',
      fechado: true,
    });
    const deps = criarDeps({ hoje: HOJE, ciclos: [anterior, cicloAtual()] });

    expect((await lerCicloAtual(deps))?.pendenciaFechamento).toBeNull();
  });

  it('Config ausente lança ConfigAusenteError', async () => {
    const deps = criarDeps({ hoje: HOJE, config: null });

    await expect(lerCicloAtual(deps)).rejects.toBeInstanceOf(ConfigAusenteError);
  });
});

describe('read-models somente leitura', () => {
  const casos = [
    { nome: 'obterEstadoHojeSomenteLeitura', fn: obterEstadoHojeSomenteLeitura },
    { nome: 'obterEstadoCicloSomenteLeitura', fn: obterEstadoCicloSomenteLeitura },
    { nome: 'obterEstadoPainelSomenteLeitura', fn: obterEstadoPainelSomenteLeitura },
  ];

  it.each(casos)('$nome devolve null sem ciclo aberto e não grava nada', async ({ fn }) => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [] });
    const antes = fotografar(deps);

    expect(await fn(deps)).toBeNull();

    expect(fotografar(deps)).toBe(antes);
    expect(deps.ciclos.criarChamadas).toBe(0);
  });

  it.each(casos)('$nome não grava nada mesmo com ciclo e transações', async ({ fn }) => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtual()],
      transacoes: [
        transacaoFake({ id: 't1', data: '2026-07-18', cicloId: 'ciclo-atual' }),
        transacaoFake({ id: 't2', data: HOJE, cicloId: 'ciclo-atual', valorCents: 4_500 }),
      ],
    });
    const antes = fotografar(deps);

    expect(await fn(deps)).not.toBeNull();

    expect(fotografar(deps)).toBe(antes);
    expect(deps.ciclos.criarChamadas).toBe(0);
    expect(deps.config.salvarChamadas).toBe(0);
  });
});

describe('equivalência com as variantes das telas', () => {
  function depsComDados() {
    return criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtual()],
      transacoes: [
        transacaoFake({ id: 't1', data: '2026-07-18', cicloId: 'ciclo-atual' }),
        transacaoFake({ id: 't2', data: HOJE, cicloId: 'ciclo-atual', valorCents: 4_500 }),
      ],
    });
  }

  it('havendo ciclo, a leitura read-only devolve exatamente o mesmo estado', async () => {
    expect(await obterEstadoHojeSomenteLeitura(depsComDados())).toEqual(
      await obterEstadoHoje(depsComDados()),
    );
    expect(await obterEstadoCicloSomenteLeitura(depsComDados())).toEqual(
      await obterEstadoCiclo(depsComDados()),
    );
    expect(await obterEstadoPainelSomenteLeitura(depsComDados())).toEqual(
      await obterEstadoPainel(depsComDados()),
    );
  });
});

describe('as telas continuam criando o ciclo (regressão)', () => {
  it('garantirCicloAtual cria o ciclo quando não existe', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [] });

    const { ciclo } = await garantirCicloAtual(deps);

    expect(ciclo.dataInicio).toBe('2026-07-05');
    expect(deps.ciclos.itens).toHaveLength(1);
    expect(deps.ciclos.criarChamadas).toBe(1);
  });

  it('obterEstadoHoje continua criando o ciclo quando não existe', async () => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [] });

    const estado = await obterEstadoHoje(deps);

    expect(estado.ciclo.dataInicio).toBe('2026-07-05');
    expect(deps.ciclos.itens).toHaveLength(1);
  });
});
