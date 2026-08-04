/**
 * Motor de autorização: funções PURAS, sem I/O (TASKS-AUTH §2.3).
 *
 * Autorização não é cálculo financeiro — por isso mora em `domain/auth/` e
 * nunca em `domain/finance/` (regra 4 do CLAUDE.md preservada nos dois
 * sentidos: nada de cálculo aqui, nada de permissão lá).
 *
 * Estas funções são chamadas na PRIMEIRA LINHA de cada caso de uso de escrita,
 * antes de qualquer I/O. Checar papel só no middleware não fecha IDOR: o
 * middleware não conhece o recurso nem a ação.
 */
import { estaAutenticado, type Ator } from './ator';

/** Erro de autorização. As actions o traduzem em `{ ok:false, erro }`. */
export class AcessoNegadoError extends Error {
  constructor(mensagem = 'Você não tem permissão para esta ação.') {
    super(mensagem);
    this.name = 'AcessoNegadoError';
  }
}

/** Só OWNER escreve. VIEWER é read-only. */
export function podeEscrever(ator: Ator): boolean {
  return estaAutenticado(ator) && ator.papel === 'OWNER';
}

/**
 * Ações reservadas ao dono: editar Config, importar/exportar backup, disparar
 * a IA (que gasta dinheiro real — DA-3).
 *
 * Hoje é equivalente a `podeEscrever` porque só há dois papéis. Existe separada
 * de propósito: quando um papel intermediário entrar (ex.: "lança gasto mas não
 * mexe na config"), a distinção já está marcada em cada chamada e nenhum
 * caso de uso precisa ser reclassificado na pressa.
 */
export function ehOwner(ator: Ator): boolean {
  return estaAutenticado(ator) && ator.papel === 'OWNER';
}

export function exigirEscrita(ator: Ator): void {
  if (!podeEscrever(ator)) {
    throw new AcessoNegadoError('Somente o dono pode alterar dados.');
  }
}

export function exigirOwner(ator: Ator): void {
  if (!ehOwner(ator)) {
    throw new AcessoNegadoError('Somente o dono pode executar esta ação.');
  }
}
