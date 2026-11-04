/**
 * Mapeamento de erro da borda HTTP: JSON malformado -> 400 JSON_INVALIDO;
 * corpo que não casa o schema zod -> 400 VALIDATION_ERROR com `details`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST as transacoesPost } from '../../../app/api/agent/v1/transacoes/route';
import {
  criarDonoDeTeste,
  criarTokenDeTeste,
  apagarDonoDeTeste,
  montarRequisicao,
  chamarJson,
  iniciarGuardaDeIsolamento,
} from './helpers';

describe('mapeamento de erro da API do agente', () => {
  let guardar: () => Promise<void>;
  let donoId: string;
  let token: string;

  beforeAll(async () => {
    guardar = await iniciarGuardaDeIsolamento();
    ({ donoId } = await criarDonoDeTeste('erros'));
    ({ token } = await criarTokenDeTeste(donoId, ['write']));
  });

  afterAll(async () => {
    await apagarDonoDeTeste(donoId);
    await guardar();
  });

  it('corpo que não é JSON válido -> 400 JSON_INVALIDO', async () => {
    const req = montarRequisicao('POST', '/transacoes', { token, corpoCru: '{ isto não é json' });
    const { status, corpo } = await chamarJson(transacoesPost, req);
    expect(status).toBe(400);
    expect((corpo as any).error.code).toBe('JSON_INVALIDO');
  });

  it('corpo que não casa o schema zod -> 400 VALIDATION_ERROR com details', async () => {
    // `valorCents` é obrigatório e positivo — string e zero quebram o schema.
    const req = montarRequisicao('POST', '/transacoes', { token, body: { valorCents: 'não é número' } });
    const { status, corpo } = await chamarJson<{ error: { code: string; details: unknown } }>(
      transacoesPost,
      req,
    );
    expect(status).toBe(400);
    expect(corpo.error.code).toBe('VALIDATION_ERROR');
    expect(corpo.error.details).toBeTruthy();
  });

  it('valorCents <= 0 -> 400 VALIDATION_ERROR', async () => {
    const req = montarRequisicao('POST', '/transacoes', { token, body: { valorCents: 0 } });
    const { status, corpo } = await chamarJson(transacoesPost, req);
    expect(status).toBe(400);
    expect((corpo as any).error.code).toBe('VALIDATION_ERROR');
  });
});
