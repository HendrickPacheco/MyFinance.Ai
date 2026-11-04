/**
 * `Idempotency-Key`: replay com o mesmo corpo devolve a MESMA transação
 * (header `Idempotent-Replayed: true`), corpo diferente é 422
 * `IDEMPOTENCY_KEY_REUSED`, e duas gravações CONCORRENTES com a mesma chave
 * produzem exatamente uma linha.
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
  prisma,
} from './helpers';

describe('idempotência de escrita (Idempotency-Key)', () => {
  let guardar: () => Promise<void>;
  let donoId: string;
  let contaVariavelId: string;
  let token: string;

  beforeAll(async () => {
    guardar = await iniciarGuardaDeIsolamento();
    const dono = await criarDonoDeTeste('idemp');
    donoId = dono.donoId;
    contaVariavelId = dono.contaVariavelId;
    ({ token } = await criarTokenDeTeste(donoId, ['write']));
  });

  afterAll(async () => {
    await apagarDonoDeTeste(donoId);
    await guardar();
  });

  it('mesma chave + mesmo corpo -> uma transação só, segunda resposta com Idempotent-Replayed', async () => {
    const chave = 'chave-replay-mesmo-corpo';
    const corpo = { valorCents: 12_345, contaId: contaVariavelId, descricao: 'idempotente' };

    const r1 = await chamarJson<{ transacao: { id: string } }>(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', { token, idempotencyKey: chave, body: corpo }),
    );
    expect(r1.status).toBe(201);
    expect(r1.headers.get('idempotent-replayed')).toBeNull();

    const r2 = await chamarJson<{ transacao: { id: string } }>(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', { token, idempotencyKey: chave, body: corpo }),
    );
    expect(r2.status).toBe(201);
    expect(r2.headers.get('idempotent-replayed')).toBe('true');
    expect(r2.corpo.transacao.id).toBe(r1.corpo.transacao.id);

    const total = await prisma.transacao.count({ where: { donoId, descricao: 'idempotente' } });
    expect(total).toBe(1);
  });

  it('mesma chave + corpo DIFERENTE -> 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const chave = 'chave-reusada-corpo-diferente';
    await chamarJson(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', {
        token,
        idempotencyKey: chave,
        body: { valorCents: 1_000, contaId: contaVariavelId },
      }),
    );

    const { status, corpo } = await chamarJson(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', {
        token,
        idempotencyKey: chave,
        body: { valorCents: 2_000, contaId: contaVariavelId },
      }),
    );
    expect(status).toBe(422);
    expect((corpo as any).error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const total = await prisma.transacao.count({ where: { donoId, valorCents: { in: [1_000, 2_000] } } });
    expect(total).toBe(1); // só a primeira foi gravada
  });

  it('duas gravações CONCORRENTES com a mesma chave -> exatamente uma transação', async () => {
    const chave = 'chave-corrida-concorrente';
    const corpo = { valorCents: 77_000, contaId: contaVariavelId, descricao: 'corrida' };

    const [r1, r2] = await Promise.all([
      chamarJson<{ transacao: { id: string } }>(
        transacoesPost,
        montarRequisicao('POST', '/transacoes', { token, idempotencyKey: chave, body: corpo }),
      ),
      chamarJson<{ transacao: { id: string } }>(
        transacoesPost,
        montarRequisicao('POST', '/transacoes', { token, idempotencyKey: chave, body: corpo }),
      ),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([201, 201]);
    expect(r1.corpo.transacao.id).toBe(r2.corpo.transacao.id);
    // Exatamente um dos dois recebeu o replay — eles perderam a corrida um do outro.
    expect([r1.headers.get('idempotent-replayed'), r2.headers.get('idempotent-replayed')].sort()).toEqual([
      null,
      'true',
    ]);

    const total = await prisma.transacao.count({ where: { donoId, descricao: 'corrida' } });
    expect(total).toBe(1);
  });
});
