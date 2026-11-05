import { describe, expect, it } from 'vitest';
import { FakeIdempotenciaAgenteRepo } from '@/application/__fakes__/fakes-ciclo-fechamento';
import { hashCorpoIdempotencia, salvarIdempotencia, verificarIdempotencia } from './idempotencia';
import { ErroApi } from './erros';

const AGORA = new Date('2026-11-04T10:00:00Z');

describe('idempotência do agente', () => {
  it('chave nova: devolve null (segue o fluxo normal)', async () => {
    const porta = new FakeIdempotenciaAgenteRepo();
    await expect(verificarIdempotencia(porta, 'chave-1', '{"a":1}')).resolves.toBeNull();
  });

  it('mesma chave, mesmo corpo: devolve o replay salvo', async () => {
    const porta = new FakeIdempotenciaAgenteRepo();
    const corpo = '{"a":1}';
    await salvarIdempotencia(
      porta,
      {
        tokenId: 'tok-1',
        metodo: 'POST',
        rota: '/api/agent/v1/transacoes',
        chave: 'chave-1',
        corpoTexto: corpo,
        statusHttp: 200,
        resposta: { ok: true },
      },
      AGORA,
    );

    await expect(verificarIdempotencia(porta, 'chave-1', corpo)).resolves.toEqual({
      statusHttp: 200,
      resposta: { ok: true },
    });
  });

  it('mesma chave, corpo DIFERENTE: lança 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const porta = new FakeIdempotenciaAgenteRepo();
    await salvarIdempotencia(
      porta,
      {
        tokenId: 'tok-1',
        metodo: 'POST',
        rota: '/api/agent/v1/transacoes',
        chave: 'chave-1',
        corpoTexto: '{"a":1}',
        statusHttp: 200,
        resposta: { ok: true },
      },
      AGORA,
    );

    await expect(verificarIdempotencia(porta, 'chave-1', '{"a":2}')).rejects.toMatchObject({
      status: 422,
      code: 'IDEMPOTENCY_KEY_REUSED',
    } satisfies Partial<ErroApi>);
  });

  it('expira depois do TTL: chave vencida some do store ao salvar outra', async () => {
    const porta = new FakeIdempotenciaAgenteRepo();
    await salvarIdempotencia(
      porta,
      {
        tokenId: 'tok-1',
        metodo: 'POST',
        rota: '/x',
        chave: 'vencida',
        corpoTexto: '{}',
        statusHttp: 200,
        resposta: {},
      },
      new Date('2000-01-01T00:00:00Z'),
    );

    // Salvar uma segunda chave dispara a higiene oportunista do fake —
    // mesmo comportamento documentado do adapter real.
    await salvarIdempotencia(
      porta,
      {
        tokenId: 'tok-1',
        metodo: 'POST',
        rota: '/x',
        chave: 'nova',
        corpoTexto: '{}',
        statusHttp: 200,
        resposta: {},
      },
      AGORA,
    );

    await expect(verificarIdempotencia(porta, 'vencida', '{}')).resolves.toBeNull();
  });

  it('hashCorpoIdempotencia é determinístico e sensível ao conteúdo', () => {
    expect(hashCorpoIdempotencia('{"a":1}')).toBe(hashCorpoIdempotencia('{"a":1}'));
    expect(hashCorpoIdempotencia('{"a":1}')).not.toBe(hashCorpoIdempotencia('{"a":2}'));
  });
});
