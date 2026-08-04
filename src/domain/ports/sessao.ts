/**
 * Porta de sessão. O domínio conhece "criar/validar/invalidar sessão" — não
 * conhece cookie, SHA-256, Prisma nem `next/headers`. Tudo isso é detalhe do
 * adapter (src/infrastructure/auth/sessao-cookie.ts).
 *
 * É esta fronteira que deixa o caminho OAuth2/Google plugável no futuro sem
 * tocar nenhum caso de uso: outro adapter, mesma porta (TASKS-AUTH §2.1).
 */
import type { Ator } from '@/domain/auth/ator';

export interface SessaoPort {
  /**
   * Abre sessão para o usuário e a persiste no transporte (cookie httpOnly).
   * Devolve a expiração para quem quiser exibi-la; o token cru nunca sobe
   * para a camada de aplicação.
   */
  criar(usuarioId: string): Promise<{ expiraEm: Date }>;
  /** Ator da sessão corrente, ou `null` se ausente/expirada/revogada. */
  validar(): Promise<Ator | null>;
  /** Revoga a sessão corrente (DELETE no banco + expira o cookie). */
  invalidar(): Promise<void>;
}
