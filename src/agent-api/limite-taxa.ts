/**
 * Rate limit por token da API do agente: 120 req/min, 429 com `Retry-After`.
 *
 * `RateLimiterMemoria` já é exatamente a janela fixa em memória que isto
 * precisa (`src/infrastructure/seguranca/rate-limiter-memoria.ts`) — mas
 * precisa ser OUTRO singleton de módulo, não o mesmo da autenticação por
 * cookie: chaves e cadência são de assuntos diferentes (tentativa de login
 * vs. requisição de agente), e compartilhar o mapa faria um token agressivo
 * consumir cota que não é dele.
 */
import { RateLimiterMemoria } from '@/infrastructure/seguranca/rate-limiter-memoria';
import { ErroApi } from './erros';

const LIMITE_POR_JANELA = 120;
const JANELA_MS = 60_000;
/** Aproximado (tamanho da janela, não o restante exato) — padrão aceitável para `Retry-After`. */
const RETRY_AFTER_SEGUNDOS = Math.ceil(JANELA_MS / 1000);

const limiter = new RateLimiterMemoria();

/** Lança `ErroApi(429, ...)` quando o token excedeu a cota. */
export async function aplicarLimiteDeTaxa(tokenId: string): Promise<void> {
  const permitido = await limiter.permitir(`agente:${tokenId}`, LIMITE_POR_JANELA, JANELA_MS);
  if (!permitido) {
    throw new ErroApi(
      429,
      'LIMITE_DE_TAXA',
      `Limite de ${LIMITE_POR_JANELA} requisições por minuto excedido para este token.`,
      { retryAfterSegundos: RETRY_AFTER_SEGUNDOS },
    );
  }
}

export { RETRY_AFTER_SEGUNDOS };
