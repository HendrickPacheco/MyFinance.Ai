/**
 * Regressão da extração da Fase 9: as duas superfícies que já existiam
 * (`/ciclo` e o painel desktop) mostravam ESTE texto, palavra por palavra.
 * Se a extração mudar uma vírgula, o dono passa a ler um aviso diferente
 * dependendo da tela em que apertou excluir.
 */
import { describe, it, expect } from 'vitest';
import { TITULO_RETROATIVO, descricaoRetroativo } from './retroatividade';

describe('TITULO_RETROATIVO', () => {
  it('é o texto que /ciclo e o painel desktop já mostravam', () => {
    expect(TITULO_RETROATIVO).toBe('Esta transação pertence a um ciclo já fechado.');
  });
});

describe('descricaoRetroativo', () => {
  it('sem lista do servidor, usa a frase genérica', () => {
    expect(descricaoRetroativo(undefined)).toBe('Confirmar vai recalcular a sobra daquele ciclo.');
    expect(descricaoRetroativo([])).toBe('Confirmar vai recalcular a sobra daquele ciclo.');
  });

  it('com um ciclo, cita o ciclo no singular', () => {
    expect(descricaoRetroativo(['jul/26'])).toBe(
      'Confirmar vai recalcular a sobra do ciclo jul/26.',
    );
  });

  it('com vários ciclos, cita todos no plural', () => {
    expect(descricaoRetroativo(['jun/26', 'jul/26'])).toBe(
      'Confirmar vai recalcular a sobra dos ciclos: jun/26, jul/26.',
    );
  });
});
