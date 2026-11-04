/**
 * Mapeamento puro query -> `FiltroTransacoes` (sem banco, sem fakes — nenhuma
 * dependência além da própria função). `GET /agent/v1/transacoes` depende
 * disto para traduzir o vocabulário HTTP (`valorMin`/`valorMax`, sem defaults)
 * no vocabulário do domínio (`valorMinCents`/`valorMaxCents`, com defaults).
 */
import { describe, it, expect } from 'vitest';
import { construirFiltroTransacoes } from './consulta-transacoes';

const BASE = { ordem: 'data' as const, direcao: 'desc' as const, limite: 50 };

describe('construirFiltroTransacoes', () => {
  it('preserva ordem/direção/limite já resolvidos pelo schema (defaults são responsabilidade do zod)', () => {
    const filtro = construirFiltroTransacoes({ ordem: 'valor', direcao: 'asc', limite: 10 });

    expect(filtro.ordem).toBe('valor');
    expect(filtro.direcao).toBe('asc');
    expect(filtro.limite).toBe(10);
  });

  it('renomeia valorMin/valorMax (vocabulário HTTP) para valorMinCents/valorMaxCents (vocabulário do domínio)', () => {
    const filtro = construirFiltroTransacoes({ ...BASE, valorMin: 1_000, valorMax: 50_000 });

    expect(filtro.valorMinCents).toBe(1_000);
    expect(filtro.valorMaxCents).toBe(50_000);
  });

  it('repassa os demais filtros sem alterar', () => {
    const filtro = construirFiltroTransacoes({
      ...BASE,
      de: '2026-07-01',
      ate: '2026-07-31',
      tipo: 'DESPESA',
      metodo: 'PIX',
      categoriaId: 'cat-1',
      contaId: 'conta-1',
      cicloId: 'ciclo-1',
      texto: 'mercado',
      parcelamentoId: 'parc-1',
      origem: 'MANUAL',
      cursor: 'abc123',
    });

    expect(filtro).toMatchObject({
      de: '2026-07-01',
      ate: '2026-07-31',
      tipo: 'DESPESA',
      metodo: 'PIX',
      categoriaId: 'cat-1',
      contaId: 'conta-1',
      cicloId: 'ciclo-1',
      texto: 'mercado',
      parcelamentoId: 'parc-1',
      origem: 'MANUAL',
      cursor: 'abc123',
    });
  });

  it('campos ausentes na query ficam undefined no filtro (sem filtro, não "zero")', () => {
    const filtro = construirFiltroTransacoes(BASE);

    expect(filtro.categoriaId).toBeUndefined();
    expect(filtro.valorMinCents).toBeUndefined();
    expect(filtro.cursor).toBeUndefined();
  });
});
