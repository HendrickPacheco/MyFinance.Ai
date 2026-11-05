/**
 * Replay de `Idempotency-Key` para escritas do agente (24h de TTL). Opera só
 * sobre `IdempotenciaPort` — nunca sabe que existe Prisma — para ser
 * testável com o fake em memória (`FakeIdempotenciaAgenteRepo`).
 */
import { createHash } from 'node:crypto';
import type { IdempotenciaPort } from '@/domain/ports/idempotencia';
import { ErroApi } from './erros';

const TTL_MS = 24 * 60 * 60 * 1000;

export function hashCorpoIdempotencia(corpoTexto: string): string {
  return createHash('sha256').update(corpoTexto).digest('hex');
}

export interface ReplayIdempotencia {
  statusHttp: number;
  resposta: unknown;
}

/**
 * `null` = chave nova, segue o fluxo normal. Mesma chave + mesmo corpo =>
 * devolve o que foi respondido da primeira vez (quem chama reenvia isso com
 * o header `Idempotent-Replayed: true`). Mesma chave + corpo DIFERENTE =>
 * `ErroApi(422, 'IDEMPOTENCY_KEY_REUSED', ...)`, porque é erro de cliente
 * (reusar a chave para outra coisa), não corrida de rede.
 */
export async function verificarIdempotencia(
  idempotencia: IdempotenciaPort,
  chave: string,
  corpoTexto: string,
): Promise<ReplayIdempotencia | null> {
  const registro = await idempotencia.buscar(chave);
  if (!registro) return null;

  if (registro.hashCorpo !== hashCorpoIdempotencia(corpoTexto)) {
    throw new ErroApi(
      422,
      'IDEMPOTENCY_KEY_REUSED',
      'Esta chave de idempotência já foi usada com um corpo diferente.',
    );
  }

  return { statusHttp: registro.statusHttp, resposta: registro.resposta };
}

/** Só chamado depois de uma escrita bem-sucedida e NÃO dry-run (ver `rotaEscrita`). */
export async function salvarIdempotencia(
  idempotencia: IdempotenciaPort,
  params: {
    tokenId: string;
    metodo: string;
    rota: string;
    chave: string;
    corpoTexto: string;
    statusHttp: number;
    resposta: unknown;
  },
  agora: Date,
): Promise<void> {
  await idempotencia.salvar({
    tokenId: params.tokenId,
    metodo: params.metodo,
    rota: params.rota,
    chave: params.chave,
    hashCorpo: hashCorpoIdempotencia(params.corpoTexto),
    statusHttp: params.statusHttp,
    resposta: params.resposta,
    expiraEm: new Date(agora.getTime() + TTL_MS),
  });
}
