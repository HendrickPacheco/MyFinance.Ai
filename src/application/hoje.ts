/**
 * Read-model da tela Hoje (SPEC 7.1). Devolve exatamente os números que a
 * tela mostra e as categorias para o lançamento rápido (6 mais usadas por
 * frequência real). Nenhum cálculo aqui — só orquestra o motor.
 */
import type { Deps } from './deps';
import type { Categoria, Ciclo, Transacao } from '@/domain/model/entidades';
import { calcularTeto, avaliarRecuperacao, type ResultadoTeto, type SaidaRecuperacao } from '@/domain/finance';
import { garantirCicloAtual } from './ciclos';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';

export interface EstadoHoje {
  hoje: string;
  ciclo: Ciclo;
  teto: ResultadoTeto;
  recuperacao: SaidaRecuperacao;
  restaNoCicloCents: number;
  categoriasRapidas: Categoria[];
  transacoesHoje: Transacao[];
  pendenciaFechamento: Ciclo | null;
}

export async function obterEstadoHoje(deps: Deps): Promise<EstadoHoje> {
  const { ciclo, pendenciaFechamento } = await garantirCicloAtual(deps);
  const hoje = deps.relogio.hoje();

  const [transacoes, categorias] = await Promise.all([
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
  ]);

  const grupos = indexarGrupoCategoria(categorias);
  const calc = paraCalculo(transacoes, grupos);

  const teto = calcularTeto({
    verbaVariavelCents: ciclo.verbaVariavelCents,
    dataFimCiclo: ciclo.dataFim,
    hoje,
    transacoes: calc,
  });

  const recuperacao = avaliarRecuperacao({
    saldoDisponivelCents: teto.saldoDisponivelCents,
    diasRestantes: teto.diasRestantes,
  });

  // "Resta no ciclo" = saldo disponível menos o que já saiu hoje.
  const restaNoCicloCents = teto.saldoDisponivelCents - teto.gastoHojeCents;

  const categoriasRapidas = categoriasMaisUsadas(categorias, transacoes, 6);
  const transacoesHoje = transacoes.filter((t) => t.data === hoje);

  return {
    hoje,
    ciclo,
    teto,
    recuperacao,
    restaNoCicloCents,
    categoriasRapidas,
    transacoesHoje,
    pendenciaFechamento,
  };
}

/** Top N categorias VARIAVEL por frequência de uso no ciclo; completa por ordem. */
function categoriasMaisUsadas(
  categorias: readonly Categoria[],
  transacoes: readonly Transacao[],
  n: number,
): Categoria[] {
  const variaveis = categorias.filter((c) => c.grupo === 'VARIAVEL');
  const freq = new Map<string, number>();
  for (const t of transacoes) {
    if (t.tipo === 'DESPESA' && t.categoriaId) {
      freq.set(t.categoriaId, (freq.get(t.categoriaId) ?? 0) + 1);
    }
  }
  return [...variaveis]
    .sort((a, b) => {
      const fa = freq.get(a.id) ?? 0;
      const fb = freq.get(b.id) ?? 0;
      if (fb !== fa) return fb - fa;
      return a.ordem - b.ordem;
    })
    .slice(0, n);
}
