/**
 * Usuário do sistema — tipo puro do domínio (espelha o modelo Prisma, sem
 * depender dele), no mesmo espírito de `src/domain/model/entidades.ts`.
 */
import type { Papel } from './ator';

export interface Usuario {
  id: string;
  email: string;
  nome: string | null;
  /** Argon2id. `null` = usuário sem senha local (caminho OAuth futuro). */
  senhaHash: string | null;
  papel: Papel;
  ativo: boolean;
}
