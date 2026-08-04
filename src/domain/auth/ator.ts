/**
 * Quem está fazendo a requisição. Tipo puro do domínio — nenhuma noção de
 * cookie, Prisma ou framework mora aqui.
 *
 * O ator NUNCA vem do cliente. Ele é resolvido no servidor a partir da sessão
 * (src/composition.ts) e injetado em `Deps`. Se o papel viajasse no request, o
 * RBAC inteiro seria decorativo.
 */

/**
 * Papéis (TASKS-AUTH §2.2). Dois, de propósito:
 * - OWNER  — o dono das finanças. Pode tudo.
 * - VIEWER — lê todas as telas, não escreve nada.
 *
 * É `String` no schema Prisma, então crescer é aditivo: um papel novo entra
 * aqui e nas funções puras de `permissoes.ts`, sem migração destrutiva.
 */
export type Papel = 'OWNER' | 'VIEWER';

export interface Ator {
  id: string;
  papel: Papel;
}

/**
 * Ator de uma requisição sem sessão válida. Não tem `id` de usuário e não pode
 * nada — existe para que `Deps.ator` seja obrigatório (nunca `undefined`), o
 * que remove a classe de bug "esqueci de checar se havia ator".
 *
 * O middleware normalmente barra o anônimo antes de chegar num caso de uso;
 * este valor é a segunda linha de defesa, não a primeira.
 */
export const ATOR_ANONIMO: Ator = { id: '', papel: 'VIEWER' };

/** `true` só para um ator com sessão real (tem `id`). */
export function estaAutenticado(ator: Ator): boolean {
  return ator.id !== '';
}
