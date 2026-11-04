/**
 * Rate limit por token (120 req/min — `src/agent-api/limite-taxa.ts`). O
 * limiter é um singleton de MÓDULO: um token dedicado, nunca compartilhado
 * com outro teste, é o que garante que a contagem aqui começa de zero.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GET as pingGet } from '../../../app/api/agent/v1/ping/route';
import {
  criarDonoDeTeste,
  criarTokenDeTeste,
  apagarDonoDeTeste,
  montarRequisicao,
  chamarJson,
  iniciarGuardaDeIsolamento,
} from './helpers';

describe('limite de taxa (429)', () => {
  let guardar: () => Promise<void>;
  let donoId: string;

  beforeAll(async () => {
    guardar = await iniciarGuardaDeIsolamento();
    ({ donoId } = await criarDonoDeTeste('ratelimit'));
  });

  afterAll(async () => {
    await apagarDonoDeTeste(donoId);
    await guardar();
  });

  it('a 121ª requisição no minuto para o MESMO token recebe 429 com Retry-After', async () => {
    const { token } = await criarTokenDeTeste(donoId, ['read']);

    let ultimoStatus = 0;
    let ultimosHeaders: Headers | null = null;
    for (let i = 0; i < 121; i += 1) {
      const resposta = await chamarJson(pingGet, montarRequisicao('GET', '/ping', { token }));
      ultimoStatus = resposta.status;
      ultimosHeaders = resposta.headers;
    }

    expect(ultimoStatus).toBe(429);
    expect(ultimosHeaders?.get('retry-after')).toBeTruthy();
  });
});
