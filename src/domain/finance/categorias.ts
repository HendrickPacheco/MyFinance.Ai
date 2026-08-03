/**
 * Ordenação de categorias para o formulário de lançamento (painel desktop e
 * tela Hoje). Pura e testada isoladamente para que os dois read-models
 * (`hoje.ts` e `dashboard.ts`) consumam a MESMA regra sem divergir: VARIAVEL
 * primeiro, ordenadas por frequência real de uso no ciclo (mais usada na
 * frente); o resto por `ordem` de cadastro.
 */
import type { GrupoCategoria, TipoTransacao } from '@/domain/model/enums';

/** Forma mínima de uma categoria para esta ordenação. */
export interface CategoriaOrdenavel {
  id: string;
  grupo: GrupoCategoria;
  ordem: number;
}

/** Forma mínima de uma transação para contar frequência de uso por categoria. */
export interface TransacaoParaFrequencia {
  tipo: TipoTransacao;
  categoriaId: string | null;
}

/** Conta quantas vezes cada categoria foi usada em lançamentos de DESPESA. */
function contarFrequenciaDespesas(
  transacoes: readonly TransacaoParaFrequencia[],
): Map<string, number> {
  const frequenciaPorCategoriaId = new Map<string, number>();
  for (const t of transacoes) {
    if (t.tipo !== 'DESPESA' || t.categoriaId == null) continue;
    frequenciaPorCategoriaId.set(t.categoriaId, (frequenciaPorCategoriaId.get(t.categoriaId) ?? 0) + 1);
  }
  return frequenciaPorCategoriaId;
}

/**
 * Ordena categorias para o formulário de lançamento: grupo VARIAVEL primeiro
 * (por frequência de uso no ciclo, desempate por `ordem`), seguido do resto
 * por `ordem`. Genérica em `T` para servir tanto `Categoria` completa (tela
 * Hoje) quanto a forma reduzida `OpcaoCategoria` (painel desktop).
 */
export function ordenarCategoriasPorUso<T extends CategoriaOrdenavel>(
  categorias: readonly T[],
  transacoes: readonly TransacaoParaFrequencia[],
): T[] {
  const frequenciaPorCategoriaId = contarFrequenciaDespesas(transacoes);

  const variaveis = categorias.filter((c) => c.grupo === 'VARIAVEL');
  const demais = categorias.filter((c) => c.grupo !== 'VARIAVEL');

  const variaveisPorUso = [...variaveis].sort((a, b) => {
    const frequenciaA = frequenciaPorCategoriaId.get(a.id) ?? 0;
    const frequenciaB = frequenciaPorCategoriaId.get(b.id) ?? 0;
    if (frequenciaB !== frequenciaA) return frequenciaB - frequenciaA;
    return a.ordem - b.ordem;
  });
  const demaisPorOrdem = [...demais].sort((a, b) => a.ordem - b.ordem);

  return [...variaveisPorUso, ...demaisPorOrdem];
}
