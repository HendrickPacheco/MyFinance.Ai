/**
 * Texto da confirmação de retroatividade (SPEC regra 9 / CLAUDE.md R2),
 * compartilhado por TODA superfície que edita ou apaga uma `Transacao`.
 *
 * Existia em cópia literal em `ciclo/transacao-linha.tsx` e em
 * `dashboard/extrato-variaveis.tsx`. Duas cópias do aviso que explica a única
 * operação capaz de corromper `sobraCents` em silêncio é exatamente o tipo de
 * duplicação que envelhece torto: a terceira superfície (`/custos/variaveis`)
 * copiaria a versão que estivesse por perto.
 *
 * Sem JSX de propósito — o ambiente de teste é `node` e não importa
 * `lucide-react`; assim o texto tem teste de regressão de verdade.
 */

/** Título factual (SPEC 11 — nunca julgador) do aviso de ciclo fechado. */
export const TITULO_RETROATIVO = 'Esta transação pertence a um ciclo já fechado.';

/**
 * Descrição do aviso, nomeando os ciclos que o servidor disse que serão
 * recalculados. `undefined`/vazio cai na frase genérica: o servidor é a fonte
 * das contagens (§4.2), e a UI nunca inventa uma lista que não recebeu.
 */
export function descricaoRetroativo(ciclosAfetados: readonly string[] | undefined): string {
  const base = 'Confirmar vai recalcular a sobra daquele ciclo.';
  if (!ciclosAfetados || ciclosAfetados.length === 0) return base;
  const lista = ciclosAfetados.join(', ');
  return ciclosAfetados.length > 1
    ? `Confirmar vai recalcular a sobra dos ciclos: ${lista}.`
    : `Confirmar vai recalcular a sobra do ciclo ${lista}.`;
}
