/**
 * Adaptação de entidades persistidas para as formas mínimas que o motor de
 * cálculo consome. Mantém o motor puro (ele nunca vê Categoria/Transacao
 * completas — só `TransacaoCalc`).
 */
import type { Categoria, Transacao } from '@/domain/model/entidades';
import { tipoVerbaEfetivo, type TransacaoCalc, type TransacaoVerba } from '@/domain/finance';

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

/** `TransacaoCalc` + o tipo de verba efetivo (parcela é sempre EXTRA — `tipoVerbaEfetivo`). */
export function paraCalculoVerba(
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
): TransacaoVerba[] {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  return transacoes.map((t) => {
    const categoria = t.categoriaId ? porId.get(t.categoriaId) : undefined;
    return {
      data: t.data,
      valorCents: t.valorCents,
      tipo: t.tipo,
      grupoCategoria: categoria?.grupo ?? null,
      provisaoId: t.provisaoId,
      tipoVerba: tipoVerbaEfetivo({
        tipoVerbaOverride: t.tipoVerbaOverride ?? null,
        tipoVerbaCategoria: categoria?.tipoVerba ?? null,
        parcelamentoId: t.parcelamentoId,
      }),
    };
  });
}
