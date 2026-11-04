/**
 * Regras PURAS de credencial de agente (API v1). Nenhuma noção de Prisma, hash
 * ou HTTP mora aqui — isso é responsabilidade de `src/agent-api/` e dos
 * adapters de infraestrutura. Autorização de agente é, como a de usuário
 * (`permissoes.ts`), tratada como assunto de `domain/auth/`, nunca de
 * `domain/finance/` (CLAUDE.md regra 4, nos dois sentidos).
 */

/**
 * Hierarquia ADITIVA: 'admin' ⊇ 'write' ⊇ 'read'. Um token com escopo mais
 * amplo satisfaz qualquer exigência mais estreita — é o mesmo raciocínio de
 * "quem pode escrever também pode ler", nunca o contrário.
 */
export type EscopoAgente = 'read' | 'write' | 'admin';

const NIVEL_DO_ESCOPO: Record<EscopoAgente, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

/**
 * `true` quando o conjunto de escopos do token cobre o escopo exigido pela
 * rota. Basta UM escopo do token no nível exigido ou acima — um token com
 * `['write']` satisfaz uma rota que exige `'read'`.
 */
export function escopoSatisfaz(
  escoposDoToken: readonly EscopoAgente[],
  necessario: EscopoAgente,
): boolean {
  const nivelNecessario = NIVEL_DO_ESCOPO[necessario];
  return escoposDoToken.some((e) => NIVEL_DO_ESCOPO[e] >= nivelNecessario);
}

/** Estado de um token no instante `agora`, para a autenticação decidir 401 vs. seguir. */
export type EstadoToken = 'valido' | 'revogado' | 'expirado';

/** Forma mínima de `ApiToken` que a regra pura precisa — nunca o registro Prisma inteiro. */
export interface TokenParaEstado {
  revogadoEm: Date | null;
  expiraEm: Date | null;
}

/**
 * Revogação tem precedência sobre expiração: um token revogado ANTES de
 * expirar ainda é "revogado", não "expirado" — a distinção importa para a
 * mensagem de erro (SPEC/CLAUDE.md D-14: todo estado inválido diz por quê).
 */
export function estadoToken(token: TokenParaEstado, agora: Date): EstadoToken {
  if (token.revogadoEm != null) return 'revogado';
  if (token.expiraEm != null && token.expiraEm.getTime() <= agora.getTime()) return 'expirado';
  return 'valido';
}
