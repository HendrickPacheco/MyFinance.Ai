/**
 * Autenticação/autorização da API do agente, contra o Postgres real:
 * cabeçalho ausente, token inexistente/revogado/expirado, escopo
 * insuficiente e o caminho feliz (200 + `ultimoUsoEm` atualizado).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GET as pingGet } from '../../../app/api/agent/v1/ping/route';
import { GET as transacoesGet, POST as transacoesPost } from '../../../app/api/agent/v1/transacoes/route';
import { POST as fecharPost } from '../../../app/api/agent/v1/ciclos/atual/fechar/route';
import { PATCH as configPatch } from '../../../app/api/agent/v1/config/route';
import {
  criarDonoDeTeste,
  criarTokenDeTeste,
  revogarTokenDeTeste,
  apagarDonoDeTeste,
  montarRequisicao,
  chamarJson,
  iniciarGuardaDeIsolamento,
  prisma,
} from './helpers';

describe('autenticação e escopo da API do agente', () => {
  let guardar: () => Promise<void>;
  let donoId: string;

  beforeAll(async () => {
    guardar = await iniciarGuardaDeIsolamento();
    ({ donoId } = await criarDonoDeTeste('auth'));
  });

  afterAll(async () => {
    await apagarDonoDeTeste(donoId);
    await guardar();
  });

  it('sem cabeçalho Authorization -> 401', async () => {
    const req = montarRequisicao('GET', '/ping', { token: null });
    const { status, corpo } = await chamarJson(pingGet, req);
    expect(status).toBe(401);
    expect((corpo as any).error.code).toBe('NAO_AUTENTICADO');
  });

  it('token inexistente -> 401', async () => {
    const req = montarRequisicao('GET', '/ping', { token: 'mfa_token-que-nunca-existiu' });
    const { status, corpo } = await chamarJson(pingGet, req);
    expect(status).toBe(401);
    expect((corpo as any).error.code).toBe('NAO_AUTENTICADO');
  });

  it('token revogado -> 401', async () => {
    const { token, tokenId } = await criarTokenDeTeste(donoId, ['read']);
    await revogarTokenDeTeste(donoId, tokenId);

    const req = montarRequisicao('GET', '/ping', { token });
    const { status, corpo } = await chamarJson(pingGet, req);
    expect(status).toBe(401);
    expect((corpo as any).error.message).toMatch(/revogado/i);
  });

  it('token expirado -> 401', async () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { token } = await criarTokenDeTeste(donoId, ['read'], { expiraEm: ontem });

    const req = montarRequisicao('GET', '/ping', { token });
    const { status, corpo } = await chamarJson(pingGet, req);
    expect(status).toBe(401);
    expect((corpo as any).error.message).toMatch(/expirado/i);
  });

  it('escopo "read" tentando POST /transacoes -> 403', async () => {
    const { token } = await criarTokenDeTeste(donoId, ['read']);
    const req = montarRequisicao('POST', '/transacoes', {
      token,
      body: { valorCents: 1000 },
    });
    const { status, corpo } = await chamarJson(transacoesPost, req);
    expect(status).toBe(403);
    expect((corpo as any).error.code).toBe('ESCOPO_INSUFICIENTE');
  });

  it('escopo "write" tentando POST /ciclos/atual/fechar (exige admin) -> 403', async () => {
    const { token } = await criarTokenDeTeste(donoId, ['write']);
    const req = montarRequisicao('POST', '/ciclos/atual/fechar', {
      token,
      body: { rendaRealizadaCents: 100_000 },
    });
    const { status, corpo } = await chamarJson(fecharPost, req);
    expect(status).toBe(403);
    expect((corpo as any).error.code).toBe('ESCOPO_INSUFICIENTE');
  });

  it('escopo "write" tentando PATCH /config (exige admin) -> 403', async () => {
    const { token } = await criarTokenDeTeste(donoId, ['write']);
    const req = montarRequisicao('PATCH', '/config', {
      token,
      body: { rendaBaseCents: 1_000_000 },
    });
    const { status, corpo } = await chamarJson(configPatch, req);
    expect(status).toBe(403);
    expect((corpo as any).error.code).toBe('ESCOPO_INSUFICIENTE');
  });

  it('token válido -> 200 e ultimoUsoEm é atualizado (fire-and-forget, mas síncrono o bastante p/ await)', async () => {
    const { token, tokenId } = await criarTokenDeTeste(donoId, ['read']);

    const antes = await prisma.apiToken.findUniqueOrThrow({ where: { id: tokenId } });
    expect(antes.ultimoUsoEm).toBeNull();

    const req = montarRequisicao('GET', '/ping', { token });
    const { status } = await chamarJson(pingGet, req);
    expect(status).toBe(200);

    // `marcarTokenUsado` é fire-and-forget (não bloqueia a resposta) — espera
    // um tick para a promise solta terminar antes de conferir o banco.
    await new Promise((r) => setTimeout(r, 50));
    const depois = await prisma.apiToken.findUniqueOrThrow({ where: { id: tokenId } });
    expect(depois.ultimoUsoEm).not.toBeNull();
  });

  it('escopo "write" satisfaz rota que exige "read" (hierarquia aditiva)', async () => {
    const { token } = await criarTokenDeTeste(donoId, ['write']);
    const req = montarRequisicao('GET', '/transacoes', { token });
    const { status } = await chamarJson(transacoesGet, req);
    expect(status).toBe(200);
  });
});
