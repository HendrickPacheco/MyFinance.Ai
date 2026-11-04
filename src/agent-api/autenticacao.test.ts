import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { autenticarAgente, type PortasAutenticacaoAgente } from './autenticacao';
import { ErroApi } from './erros';
import type { ApiTokenRegistro } from '@/domain/ports/api-tokens';

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const TOKEN_CRU = 'mfa_token-de-teste';

function tokenFake(patch: Partial<ApiTokenRegistro> = {}): ApiTokenRegistro {
  return {
    id: 'token-1',
    donoId: 'dono-1',
    nome: 'Agente de teste',
    prefixo: 'mfa_tok-de',
    hash: hash(TOKEN_CRU),
    escopos: ['read'],
    criadoEm: new Date('2026-01-01T00:00:00Z'),
    ultimoUsoEm: null,
    expiraEm: null,
    revogadoEm: null,
    ...patch,
  };
}

function portasFake(opcoes: {
  token?: ApiTokenRegistro | null;
  usuarioAtivo?: boolean;
}): PortasAutenticacaoAgente & { marcarTokenUsado: ReturnType<typeof vi.fn> } {
  const token = opcoes.token === undefined ? tokenFake() : opcoes.token;
  const marcarTokenUsado = vi.fn().mockResolvedValue(undefined);
  return {
    buscarTokenPorHash: async (h) => (token && token.hash === h ? token : null),
    marcarTokenUsado,
    buscarUsuarioAtivo: async () => (opcoes.usuarioAtivo === false ? null : { ativo: true }),
  };
}

function reqComBearer(token: string | null): Request {
  const headers = new Headers();
  if (token !== null) headers.set('authorization', `Bearer ${token}`);
  return new Request('https://app.local/api/agent/v1/ping', { headers });
}

describe('autenticarAgente', () => {
  it('rejeita requisição sem cabeçalho Authorization (401)', async () => {
    const portas = portasFake({});
    await expect(
      autenticarAgente(new Request('https://app.local/x'), 'read', portas),
    ).rejects.toMatchObject({ status: 401, code: 'NAO_AUTENTICADO' } satisfies Partial<ErroApi>);
  });

  it('rejeita cabeçalho malformado (sem "Bearer")', async () => {
    const portas = portasFake({});
    const headers = new Headers({ authorization: `Token ${TOKEN_CRU}` });
    await expect(
      autenticarAgente(new Request('https://app.local/x', { headers }), 'read', portas),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejeita token desconhecido', async () => {
    const portas = portasFake({ token: null });
    await expect(
      autenticarAgente(reqComBearer(TOKEN_CRU), 'read', portas),
    ).rejects.toMatchObject({ status: 401, code: 'NAO_AUTENTICADO' });
  });

  it('rejeita token revogado', async () => {
    const portas = portasFake({ token: tokenFake({ revogadoEm: new Date() }) });
    await expect(
      autenticarAgente(reqComBearer(TOKEN_CRU), 'read', portas),
    ).rejects.toMatchObject({ status: 401, message: 'Token revogado.' });
  });

  it('rejeita token expirado', async () => {
    const portas = portasFake({ token: tokenFake({ expiraEm: new Date('2020-01-01') }) });
    await expect(
      autenticarAgente(reqComBearer(TOKEN_CRU), 'read', portas),
    ).rejects.toMatchObject({ status: 401, message: 'Token expirado.' });
  });

  it('rejeita escopo insuficiente (403)', async () => {
    const portas = portasFake({ token: tokenFake({ escopos: ['read'] }) });
    await expect(
      autenticarAgente(reqComBearer(TOKEN_CRU), 'write', portas),
    ).rejects.toMatchObject({ status: 403, code: 'ESCOPO_INSUFICIENTE' });
  });

  it('rejeita quando o usuário do token não existe mais ou está inativo', async () => {
    const portas = portasFake({ usuarioAtivo: false });
    await expect(
      autenticarAgente(reqComBearer(TOKEN_CRU), 'read', portas),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('sucesso: devolve donoId/tokenId/escopos e atualiza ultimoUsoEm', async () => {
    const portas = portasFake({ token: tokenFake({ escopos: ['read', 'write'] }) });
    const agora = new Date('2026-11-04T10:00:00Z');

    const resultado = await autenticarAgente(reqComBearer(TOKEN_CRU), 'write', portas, agora);

    expect(resultado).toEqual({ donoId: 'dono-1', tokenId: 'token-1', escopos: ['read', 'write'] });
    // Fire-and-forget, mas síncrono o suficiente no fake para já ter sido chamado.
    expect(portas.marcarTokenUsado).toHaveBeenCalledWith('dono-1', 'token-1', agora);
  });

  it('não deixa a requisição falhar quando marcarTokenUsado rejeita', async () => {
    const portas = portasFake({ token: tokenFake() });
    portas.marcarTokenUsado.mockRejectedValueOnce(new Error('falha de telemetria'));
    const consoleErroOriginal = console.error;
    console.error = vi.fn();

    try {
      await expect(autenticarAgente(reqComBearer(TOKEN_CRU), 'read', portas)).resolves.toBeDefined();
    } finally {
      console.error = consoleErroOriginal;
    }
  });
});
