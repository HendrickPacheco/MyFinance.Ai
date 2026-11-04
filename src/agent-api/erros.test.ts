import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import { CicloFechadoError } from '@/application/retroatividade';
import { ErroApi, mapearErroApi } from './erros';

class ExemploNaoEncontradoError extends Error {
  constructor() {
    super('Exemplo não encontrado.');
    this.name = 'ExemploNaoEncontradoError';
  }
}

describe('mapearErroApi', () => {
  it('ErroApi: usa status/code/message/details tal como lançado', () => {
    const { status, corpo } = mapearErroApi(new ErroApi(429, 'LIMITE_DE_TAXA', 'muito rápido', { x: 1 }));
    expect(status).toBe(429);
    expect(corpo).toEqual({ error: { code: 'LIMITE_DE_TAXA', message: 'muito rápido', details: { x: 1 } } });
  });

  it('ZodError: 400 VALIDATION_ERROR com issues em details', () => {
    const resultado = z.object({ nome: z.string() }).safeParse({});
    if (resultado.success) throw new Error('deveria ter falhado');

    const { status, corpo } = mapearErroApi(resultado.error);
    expect(status).toBe(400);
    expect(corpo.error.code).toBe('VALIDATION_ERROR');
    expect(corpo.error.details).toEqual(resultado.error.issues);
  });

  it('CicloFechadoError: 409 CONFIRMACAO_NECESSARIA com ciclosAfetados', () => {
    const { status, corpo } = mapearErroApi(new CicloFechadoError(['ciclo-1', 'ciclo-2']));
    expect(status).toBe(409);
    expect(corpo.error.code).toBe('CONFIRMACAO_NECESSARIA');
    expect(corpo.error.details).toEqual({ ciclosAfetados: ['ciclo-1', 'ciclo-2'] });
  });

  it('AcessoNegadoError: 403 ACESSO_NEGADO', () => {
    const { status, corpo } = mapearErroApi(new AcessoNegadoError());
    expect(status).toBe(403);
    expect(corpo.error.code).toBe('ACESSO_NEGADO');
  });

  it('Erro nomeado "*NaoEncontradoError": 404 NAO_ENCONTRADO', () => {
    const { status, corpo } = mapearErroApi(new ExemploNaoEncontradoError());
    expect(status).toBe(404);
    expect(corpo.error.code).toBe('NAO_ENCONTRADO');
    expect(corpo.error.message).toBe('Exemplo não encontrado.');
  });

  it('Error genérico do domínio: 422 REGRA_DE_NEGOCIO', () => {
    const { status, corpo } = mapearErroApi(new Error('Configuração não encontrada.'));
    expect(status).toBe(422);
    expect(corpo.error.code).toBe('REGRA_DE_NEGOCIO');
    expect(corpo.error.message).toBe('Configuração não encontrada.');
  });

  it('valor não-Error: 500 ERRO_INTERNO, sem vazar o valor bruto', () => {
    const { status, corpo } = mapearErroApi('algo lançado sem ser Error');
    expect(status).toBe(500);
    expect(corpo).toEqual({ error: { code: 'ERRO_INTERNO', message: 'Erro interno.' } });
  });
});
