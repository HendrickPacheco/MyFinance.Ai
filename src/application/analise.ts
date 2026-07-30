/**
 * Read-model da Análise de corte (SPEC 5.5). Média dos últimos N ciclos
 * fechados; ranking por custo anualizado; detector de assinaturas.
 */
import type { Deps } from './deps';
import type { Categoria } from '@/domain/model/entidades';
import {
  analiseCategoria,
  detectarAssinaturas,
  type ResultadoAnaliseCategoria,
  type AssinaturaDetectada,
  type CicloDaCategoria,
} from '@/domain/finance';

export interface LinhaAnalise extends ResultadoAnaliseCategoria {
  categoriaId: string;
  nome: string;
}

export interface EstadoAnalise {
  ciclosConsiderados: number;
  ranking: LinhaAnalise[];
  assinaturas: AssinaturaDetectada[];
}

export async function obterAnalise(deps: Deps, nCiclos = 3): Promise<EstadoAnalise> {
  const ciclos = await deps.ciclos.ultimosFechados(nCiclos);
  const categorias = await deps.categorias.listar();

  if (ciclos.length === 0) {
    return { ciclosConsiderados: 0, ranking: [], assinaturas: [] };
  }

  // Ordena do mais antigo para o mais novo (tendência compara 1º vs último).
  const ciclosCronologicos = [...ciclos].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  const idsCronologicos = ciclosCronologicos.map((c) => c.id);

  const transacoesPorCiclo = await Promise.all(
    ciclosCronologicos.map((c) => deps.transacoes.listarPorCiclo(c.id)),
  );

  const catById = new Map<string, Categoria>(categorias.map((c) => [c.id, c]));

  // Agrupa despesas VARIAVEL por categoria e por ciclo.
  const porCategoria = new Map<string, CicloDaCategoria[]>();
  const assinaturaTx: { descricao: string | null; valorCents: number; cicloId: string }[] = [];

  transacoesPorCiclo.forEach((txs, idx) => {
    const ciclo = ciclosCronologicos[idx];
    if (!ciclo) return;
    const despesasPorCat = new Map<string, number[]>();
    const estornosPorCat = new Map<string, number[]>();
    for (const t of txs) {
      if (!t.categoriaId) continue;
      const cat = catById.get(t.categoriaId);
      if (!cat || cat.grupo !== 'VARIAVEL' || t.provisaoId) continue;

      if (t.tipo === 'DESPESA') {
        const lista = despesasPorCat.get(t.categoriaId) ?? [];
        lista.push(t.valorCents);
        despesasPorCat.set(t.categoriaId, lista);
        assinaturaTx.push({ descricao: t.descricao, valorCents: t.valorCents, cicloId: ciclo.id });
      } else if (t.tipo === 'ESTORNO') {
        const lista = estornosPorCat.get(t.categoriaId) ?? [];
        lista.push(t.valorCents);
        estornosPorCat.set(t.categoriaId, lista);
      }
    }
    // Categorias com despesa OU estorno no ciclo entram no agrupamento.
    const categoriasNoCiclo = new Set([...despesasPorCat.keys(), ...estornosPorCat.keys()]);
    for (const categoriaId of categoriasNoCiclo) {
      const lista = porCategoria.get(categoriaId) ?? [];
      lista.push({
        cicloId: ciclo.id,
        valoresCents: despesasPorCat.get(categoriaId) ?? [],
        estornosCents: estornosPorCat.get(categoriaId) ?? [],
      });
      porCategoria.set(categoriaId, lista);
    }
  });

  const ranking: LinhaAnalise[] = [];
  for (const [categoriaId, ciclosDaCat] of porCategoria) {
    const cat = catById.get(categoriaId);
    if (!cat) continue;
    const r = analiseCategoria({ ciclos: ciclosDaCat, essencial: cat.essencial });
    ranking.push({ ...r, categoriaId, nome: cat.nome });
  }
  ranking.sort((a, b) => b.custoAnualizadoCents - a.custoAnualizadoCents);

  const assinaturas = detectarAssinaturas({
    transacoes: assinaturaTx,
    ciclosOrdenados: idsCronologicos,
  });

  return { ciclosConsiderados: ciclos.length, ranking, assinaturas };
}
