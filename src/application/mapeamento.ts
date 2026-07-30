/**
 * Adaptação de entidades persistidas para as formas mínimas que o motor de
 * cálculo consome. Mantém o motor puro (ele nunca vê Categoria/Transacao
 * completas — só `TransacaoCalc`).
 */
import type { Categoria, Transacao } from '@/domain/model/entidades';
import type { TransacaoCalc } from '@/domain/finance';

export function indexarGrupoCategoria(categorias: readonly Categoria[]): Map<string, Categoria['grupo']> {
  return new Map(categorias.map((c) => [c.id, c.grupo]));
}

export function paraCalculo(
  transacoes: readonly Transacao[],
  gruposPorCategoria: Map<string, Categoria['grupo']>,
): TransacaoCalc[] {
  return transacoes.map((t) => ({
    data: t.data,
    valorCents: t.valorCents,
    tipo: t.tipo,
    grupoCategoria: t.categoriaId ? (gruposPorCategoria.get(t.categoriaId) ?? null) : null,
    provisaoId: t.provisaoId,
  }));
}
