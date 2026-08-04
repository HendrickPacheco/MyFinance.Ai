import { describe, expect, it } from 'vitest';
import { ATOR_ANONIMO, estaAutenticado, type Ator } from './ator';
import {
  AcessoNegadoError,
  ehOwner,
  exigirEscrita,
  exigirOwner,
  podeEscrever,
} from './permissoes';

const OWNER: Ator = { id: 'u-owner', papel: 'OWNER' };
const VIEWER: Ator = { id: 'u-viewer', papel: 'VIEWER' };

describe('estaAutenticado', () => {
  it('reconhece ator com id como autenticado', () => {
    expect(estaAutenticado(OWNER)).toBe(true);
    expect(estaAutenticado(VIEWER)).toBe(true);
  });

  it('trata o anônimo como não autenticado', () => {
    expect(estaAutenticado(ATOR_ANONIMO)).toBe(false);
  });
});

describe('podeEscrever', () => {
  it('libera OWNER', () => {
    expect(podeEscrever(OWNER)).toBe(true);
  });

  it('bloqueia VIEWER', () => {
    expect(podeEscrever(VIEWER)).toBe(false);
  });

  it('bloqueia anônimo', () => {
    expect(podeEscrever(ATOR_ANONIMO)).toBe(false);
  });

  it('bloqueia um OWNER sem sessão — papel forjado sem id não vale', () => {
    expect(podeEscrever({ id: '', papel: 'OWNER' })).toBe(false);
  });
});

describe('ehOwner', () => {
  it('só é verdadeiro para OWNER autenticado', () => {
    expect(ehOwner(OWNER)).toBe(true);
    expect(ehOwner(VIEWER)).toBe(false);
    expect(ehOwner(ATOR_ANONIMO)).toBe(false);
    expect(ehOwner({ id: '', papel: 'OWNER' })).toBe(false);
  });
});

describe('exigirEscrita', () => {
  it('deixa OWNER passar sem lançar', () => {
    expect(() => exigirEscrita(OWNER)).not.toThrow();
  });

  it('lança AcessoNegadoError para VIEWER', () => {
    expect(() => exigirEscrita(VIEWER)).toThrow(AcessoNegadoError);
  });

  it('lança AcessoNegadoError para anônimo', () => {
    expect(() => exigirEscrita(ATOR_ANONIMO)).toThrow(AcessoNegadoError);
  });

  it('não vaza detalhe técnico na mensagem', () => {
    expect(() => exigirEscrita(VIEWER)).toThrow(/Somente o dono/);
  });
});

describe('exigirOwner', () => {
  it('deixa OWNER passar sem lançar', () => {
    expect(() => exigirOwner(OWNER)).not.toThrow();
  });

  it('lança AcessoNegadoError para VIEWER e anônimo', () => {
    expect(() => exigirOwner(VIEWER)).toThrow(AcessoNegadoError);
    expect(() => exigirOwner(ATOR_ANONIMO)).toThrow(AcessoNegadoError);
  });
});

describe('AcessoNegadoError', () => {
  it('tem name próprio, para a action distinguir do erro genérico', () => {
    const erro = new AcessoNegadoError();
    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe('AcessoNegadoError');
  });
});
