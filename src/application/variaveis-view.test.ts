import { describe, it, expect } from 'vitest';
import { parsearFiltroVariaveis, intervalosPreset } from './variaveis-view';

const PADRAO = { de: '2026-08-01', ate: '2026-08-31' };

describe('parsearFiltroVariaveis', () => {
  it('sem parâmetro nenhum, usa o ciclo atual e não filtra categoria nem método', () => {
    expect(parsearFiltroVariaveis({}, PADRAO)).toEqual({
      de: '2026-08-01',
      ate: '2026-08-31',
      categoriaId: null,
      metodo: null,
    });
  });

  it('lê período, categoria e método da URL', () => {
    expect(
      parsearFiltroVariaveis(
        { de: '2026-06-01', ate: '2026-08-31', categoria: 'cat-1', metodo: 'PIX' },
        PADRAO,
      ),
    ).toEqual({ de: '2026-06-01', ate: '2026-08-31', categoriaId: 'cat-1', metodo: 'PIX' });
  });

  it('data malformada cai no padrão em vez de lançar (URL torta não derruba a tela)', () => {
    const filtro = parsearFiltroVariaveis({ de: '01/06/2026', ate: 'ontem' }, PADRAO);
    expect(filtro.de).toBe(PADRAO.de);
    expect(filtro.ate).toBe(PADRAO.ate);
  });

  it('método desconhecido vira "todos" em vez de filtrar por lixo', () => {
    expect(parsearFiltroVariaveis({ metodo: 'CHEQUE' }, PADRAO).metodo).toBeNull();
  });

  it('categoria vazia é "todas", não uma categoria de id vazio', () => {
    expect(parsearFiltroVariaveis({ categoria: '' }, PADRAO).categoriaId).toBeNull();
  });

  it('intervalo invertido é corrigido, não descartado', () => {
    const filtro = parsearFiltroVariaveis({ de: '2026-08-31', ate: '2026-06-01' }, PADRAO);
    expect(filtro).toMatchObject({ de: '2026-06-01', ate: '2026-08-31' });
  });

  it('parâmetro repetido usa a primeira ocorrência', () => {
    expect(parsearFiltroVariaveis({ metodo: ['PIX', 'CREDITO'] }, PADRAO).metodo).toBe('PIX');
  });
});

describe('intervalosPreset', () => {
  const presets = intervalosPreset({ inicio: '2026-08-01', fim: '2026-08-31' });

  it('"ciclo atual" é exatamente o ciclo', () => {
    expect(presets.ciclo).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
  });

  it('os atalhos contam ciclos para trás e terminam no FIM do ciclo', () => {
    // Terminar em "hoje" faria a competência futura já lançada (`ehProgramado`)
    // sumir justamente da tela que existe para gerenciá-la.
    expect(presets['3m']).toEqual({ de: '2026-06-01', ate: '2026-08-31' });
    expect(presets['6m']).toEqual({ de: '2026-03-01', ate: '2026-08-31' });
    expect(presets['12m']).toEqual({ de: '2025-09-01', ate: '2026-08-31' });
  });
});
