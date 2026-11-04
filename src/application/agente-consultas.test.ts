/**
 * Testes das agregações de leitura da API do agente (`compararCiclos`,
 * `obterGastosPorCategoria`, `obterTendenciaCategoria`). Tudo roda contra
 * fakes em memória — nenhum acesso ao banco real.
 */
import { describe, it, expect } from 'vitest';
import {
  compararCiclos,
  listarCiclosAgente,
  obterDetalheCicloAgente,
  obterGastosPorCategoria,
  obterTendenciaCategoria,
} from './agente-consultas';
import {
  criarDeps,
  cicloFake,
  transacaoFake,
  CATEGORIA_VARIAVEL,
  CATEGORIA_FIXA,
} from './__fakes__/fakes-ciclo-fechamento';
import type { Categoria } from '@/domain/model/entidades';

const CATEGORIA_LAZER: Categoria = {
  id: 'cat-lazer',
  nome: 'Lazer',
  grupo: 'VARIAVEL',
  essencial: false,
  icone: null,
  cor: null,
  ordem: 3,
};

describe('compararCiclos', () => {
  it('por ids: devolve totais e porCategoria na ordem pedida', async () => {
    const c1 = cicloFake({ id: 'c1', dataInicio: '2026-06-05', dataFim: '2026-07-04', fechado: true, sobraCents: 5_000 });
    const c2 = cicloFake({ id: 'c2', dataInicio: '2026-07-05', dataFim: '2026-08-04', fechado: true, sobraCents: 2_000 });
    const deps = criarDeps({
      hoje: '2026-08-10',
      categorias: [CATEGORIA_VARIAVEL, CATEGORIA_FIXA, CATEGORIA_LAZER],
      ciclos: [c1, c2],
      transacoes: [
        transacaoFake({ id: 't1', cicloId: 'c1', data: '2026-06-10', valorCents: 10_000, categoriaId: CATEGORIA_VARIAVEL.id }),
        transacaoFake({ id: 't2', cicloId: 'c2', data: '2026-07-10', valorCents: 7_000, categoriaId: CATEGORIA_LAZER.id }),
      ],
    });

    const resultado = await compararCiclos(deps, { ids: ['c2', 'c1'] });

    expect(resultado.ciclos.map((c) => c.cicloId)).toEqual(['c2', 'c1']);
    expect(resultado.ciclos[0]?.gastoRealizadoCents).toBe(7_000);
    expect(resultado.ciclos[0]?.porCategoria).toEqual([
      expect.objectContaining({ categoriaId: CATEGORIA_LAZER.id, totalCents: 7_000 }),
    ]);
    expect(resultado.ciclos[1]?.gastoRealizadoCents).toBe(10_000);
  });

  it('ids que não existem são descartados em silêncio', async () => {
    const deps = criarDeps({ ciclos: [cicloFake({ id: 'c1' })] });

    const resultado = await compararCiclos(deps, { ids: ['c1', 'fantasma'] });

    expect(resultado.ciclos.map((c) => c.cicloId)).toEqual(['c1']);
  });

  it('sem ids: usa os últimos N fechados (default 2)', async () => {
    const fechados = [
      cicloFake({ id: 'c1', dataInicio: '2026-05-05', dataFim: '2026-06-04', fechado: true }),
      cicloFake({ id: 'c2', dataInicio: '2026-06-05', dataFim: '2026-07-04', fechado: true }),
      cicloFake({ id: 'c3', dataInicio: '2026-07-05', dataFim: '2026-08-04', fechado: true }),
    ];
    const deps = criarDeps({ ciclos: fechados });

    const resultado = await compararCiclos(deps, {});

    expect(resultado.ciclos).toHaveLength(2);
  });

  it('nenhum ciclo encontrado devolve lista vazia, sem lançar', async () => {
    const deps = criarDeps({ ciclos: [] });

    const resultado = await compararCiclos(deps, {});

    expect(resultado.ciclos).toEqual([]);
  });
});

describe('listarCiclosAgente', () => {
  it('ciclo em curso primeiro, sem duplicar se ele também estiver entre os fechados', async () => {
    const atual = cicloFake({ id: 'atual', dataInicio: '2026-08-05', dataFim: '2026-09-04' });
    const fechado = cicloFake({ id: 'f1', dataInicio: '2026-07-05', dataFim: '2026-08-04', fechado: true });
    const deps = criarDeps({ hoje: '2026-08-10', ciclos: [atual, fechado] });

    const resultado = await listarCiclosAgente(deps, { limite: 10 });

    expect(resultado.ciclos.map((c) => c.id)).toEqual(['atual', 'f1']);
  });

  it('sem ciclo em curso: só os fechados', async () => {
    const deps = criarDeps({
      hoje: '2026-08-10',
      ciclos: [cicloFake({ id: 'f1', dataInicio: '2026-06-05', dataFim: '2026-07-04', fechado: true })],
    });

    const resultado = await listarCiclosAgente(deps, { limite: 10 });

    expect(resultado.ciclos.map((c) => c.id)).toEqual(['f1']);
  });
});

describe('obterDetalheCicloAgente', () => {
  it('devolve o ciclo com gasto realizado e porCategoria', async () => {
    const ciclo = cicloFake({ id: 'c1', dataInicio: '2026-07-05', dataFim: '2026-08-04' });
    const deps = criarDeps({
      hoje: '2026-08-04',
      categorias: [CATEGORIA_VARIAVEL],
      ciclos: [ciclo],
      transacoes: [
        transacaoFake({ id: 't1', cicloId: 'c1', data: '2026-07-10', valorCents: 5_000, categoriaId: CATEGORIA_VARIAVEL.id }),
      ],
    });

    const resultado = await obterDetalheCicloAgente(deps, 'c1');

    expect(resultado?.id).toBe('c1');
    expect(resultado?.gastoRealizadoCents).toBe(5_000);
    expect(resultado?.porCategoria).toEqual([
      expect.objectContaining({ categoriaId: CATEGORIA_VARIAVEL.id, totalCents: 5_000 }),
    ]);
  });

  it('id inexistente devolve null', async () => {
    const deps = criarDeps({ ciclos: [] });

    const resultado = await obterDetalheCicloAgente(deps, 'fantasma');

    expect(resultado).toBeNull();
  });
});

describe('obterGastosPorCategoria', () => {
  it('por cicloId: agrega só as transações daquele ciclo', async () => {
    const ciclo = cicloFake({ id: 'c1', dataInicio: '2026-07-05', dataFim: '2026-08-04' });
    const deps = criarDeps({
      hoje: '2026-08-04',
      categorias: [CATEGORIA_VARIAVEL, CATEGORIA_LAZER],
      ciclos: [ciclo],
      transacoes: [
        transacaoFake({ id: 't1', cicloId: 'c1', data: '2026-07-10', valorCents: 4_000, categoriaId: CATEGORIA_VARIAVEL.id }),
        transacaoFake({ id: 't2', cicloId: 'outro', data: '2026-06-10', valorCents: 9_000, categoriaId: CATEGORIA_VARIAVEL.id }),
      ],
    });

    const resultado = await obterGastosPorCategoria(deps, { cicloId: 'c1' });

    expect(resultado?.periodo).toEqual({ cicloId: 'c1', dataInicio: '2026-07-05', dataFim: '2026-08-04' });
    expect(resultado?.categorias).toEqual([
      expect.objectContaining({ categoriaId: CATEGORIA_VARIAVEL.id, totalCents: 4_000 }),
    ]);
  });

  it('cicloId inexistente devolve null', async () => {
    const deps = criarDeps({ ciclos: [] });

    const resultado = await obterGastosPorCategoria(deps, { cicloId: 'fantasma' });

    expect(resultado).toBeNull();
  });

  it('por intervalo de datas: só entram transações dentro de [de, ate]', async () => {
    const deps = criarDeps({
      categorias: [CATEGORIA_VARIAVEL],
      transacoes: [
        transacaoFake({ id: 'antes', data: '2026-06-30', valorCents: 1_000, categoriaId: CATEGORIA_VARIAVEL.id }),
        transacaoFake({ id: 'dentro', data: '2026-07-15', valorCents: 2_000, categoriaId: CATEGORIA_VARIAVEL.id }),
        transacaoFake({ id: 'depois', data: '2026-08-01', valorCents: 4_000, categoriaId: CATEGORIA_VARIAVEL.id }),
      ],
    });

    const resultado = await obterGastosPorCategoria(deps, { de: '2026-07-01', ate: '2026-07-31' });

    expect(resultado?.categorias).toEqual([
      expect.objectContaining({ categoriaId: CATEGORIA_VARIAVEL.id, totalCents: 2_000 }),
    ]);
  });
});

describe('obterTendenciaCategoria', () => {
  it('devolve a série em ordem cronológica, com 0 nos ciclos sem gasto na categoria', async () => {
    const c1 = cicloFake({ id: 'c1', dataInicio: '2026-06-05', dataFim: '2026-07-04', fechado: true });
    const c2 = cicloFake({ id: 'c2', dataInicio: '2026-07-05', dataFim: '2026-08-04', fechado: true });
    const deps = criarDeps({
      categorias: [CATEGORIA_VARIAVEL, CATEGORIA_LAZER],
      ciclos: [c2, c1], // fora de ordem de propósito
      transacoes: [
        transacaoFake({ id: 't1', cicloId: 'c1', data: '2026-06-10', valorCents: 3_000, categoriaId: CATEGORIA_LAZER.id }),
      ],
    });

    const resultado = await obterTendenciaCategoria(deps, { categoriaId: CATEGORIA_LAZER.id, ultimos: 2 });

    expect(resultado.categoriaNome).toBe('Lazer');
    expect(resultado.pontos.map((p) => p.cicloId)).toEqual(['c1', 'c2']);
    expect(resultado.pontos[0]?.totalCents).toBe(3_000);
    expect(resultado.pontos[1]?.totalCents).toBe(0);
  });

  it('categoria desconhecida: nome null, série toda zerada', async () => {
    const deps = criarDeps({ ciclos: [cicloFake({ id: 'c1', fechado: true })] });

    const resultado = await obterTendenciaCategoria(deps, { categoriaId: 'nao-existe' });

    expect(resultado.categoriaNome).toBeNull();
    expect(resultado.pontos[0]?.totalCents).toBe(0);
  });
});
