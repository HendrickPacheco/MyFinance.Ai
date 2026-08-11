/**
 * Ordem de exibição da lista de compras parceladas. NÃO é regra financeira —
 * é apresentação, e por isso mora aqui e não em `src/domain/finance/`.
 *
 * Mora num módulo próprio, sem JSX e sem React, por um motivo prático: a
 * ordenação default é parte do contrato do §3.2 (`terminaEm` crescente) e
 * precisa de teste; o ambiente de teste é `node`, e um módulo com JSX e
 * `lucide-react` não é importável nele.
 */
import type { LinhaParcelamentoGestao } from '@/application/parcelados-view';

export type ColunaParcelados = 'compra' | 'valorMensal' | 'resta' | 'termina';

export interface OrdenacaoParcelados {
  coluna: ColunaParcelados;
  direcao: 'asc' | 'desc';
}

/**
 * Ordenação DEFAULT: `terminaEm` crescente (§3.2). Não é gosto — a pergunta
 * que a tela responde é "quando a verba respira", e ela se lê de cima para
 * baixo.
 */
export const ORDENACAO_PADRAO: OrdenacaoParcelados = { coluna: 'termina', direcao: 'asc' };

export function ordenarParcelamentos(
  linhas: readonly LinhaParcelamentoGestao[],
  { coluna, direcao }: OrdenacaoParcelados,
): LinhaParcelamentoGestao[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return [...linhas].sort((a, b) => {
    if (coluna === 'valorMensal') {
      return sinal * (a.resumo.valorMensalCents - b.resumo.valorMensalCents);
    }
    if (coluna === 'resta') {
      return sinal * (a.resumo.valorRestanteCents - b.resumo.valorRestanteCents);
    }
    if (coluna === 'termina') {
      // Compra sem fim previsto (`terminaEm: null`, nenhuma parcela viva) vai
      // para o FIM da lista nos dois sentidos: inventar uma data para ordenar
      // faria uma compra encerrada parecer a próxima a acabar.
      if (a.resumo.terminaEm == null) return b.resumo.terminaEm == null ? 0 : 1;
      if (b.resumo.terminaEm == null) return -1;
      return sinal * a.resumo.terminaEm.localeCompare(b.resumo.terminaEm);
    }
    return sinal * a.resumo.descricao.localeCompare(b.resumo.descricao, 'pt-BR');
  });
}
