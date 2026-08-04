/**
 * Porta de hashing de senha. O domínio sabe que existe "hashear/verificar" —
 * não sabe que é Argon2id (isso vive só em src/infrastructure/auth/argon2.ts).
 */
export interface HashSenhaPort {
  hashear(senha: string): Promise<string>;
  /** Comparação em tempo constante — a cargo do adapter. */
  verificar(senha: string, hash: string): Promise<boolean>;
}
