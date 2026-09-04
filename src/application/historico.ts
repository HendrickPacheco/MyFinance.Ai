/**
 * Read-model do Histórico (`/historico`, SPEC 7): orquestra as portas para
 * montar o retrato mês a mês de ciclos FECHADOS. Nenhuma regra de cálculo
 * mora aqui (regra 4 do CLAUDE.md) — tudo isso vive em `domain/finance/
 * historico.ts`, que este arquivo só alimenta com dados já lidos.
 */
import type { Deps } from './deps';
import { montarHistorico, type CicloHistoricoInput, type LancamentoHistorico } from '@/domain/finance';
import type { EstadoHistorico } from './historico-tipos';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';

/**
 * Teto de segurança, NÃO uma janela: o histórico mostra TODOS os ciclos
 * fechados. `ultimosFechados` exige um `take`, e um número é mais barato que
 * um método novo na porta (`CicloRepository`) mais adapter mais fakes. 600 =
 * 50 anos de ciclos mensais: quem alcançar esse limite tem problema melhor
 * que este. Vale para os snapshots de patrimônio pelo mesmo motivo — a
 * fotografia é mensal, então a contagem tem a mesma ordem de grandeza.
 */
const TETO_CICLOS_HISTORICO = 600;

export async function obterHistorico(deps: Deps): Promise<EstadoHistorico> {
  const ciclos = await deps.ciclos.ultimosFechados(TETO_CICLOS_HISTORICO);
  if (ciclos.length === 0) {
    return montarHistorico([]);
  }

  const [transacoesPorCiclo, categorias, snapshots] = await Promise.all([
    Promise.all(ciclos.map((c) => deps.transacoes.listarPorCiclo(c.id))),
    deps.categorias.listar(),
    deps.patrimonio.ultimosSnapshots(TETO_CICLOS_HISTORICO),
  ]);

  const grupos = indexarGrupoCategoria(categorias);

  // Mais antigo primeiro: permite achar, para cada `dataFim`, o snapshot MAIS
  // RECENTE com `data <= dataFim` varrendo de trás para frente — comparação
  // lexicográfica de string (SPEC 5.1), nunca `Date`.
  const snapshotsCronologicos = [...snapshots].sort((a, b) => a.data.localeCompare(b.data));

  const patrimonioFimPorCiclo = (dataFim: string): number | null => {
    let maisRecente: number | null = null;
    for (const s of snapshotsCronologicos) {
      if (s.data > dataFim) break; // comparação lexicográfica (SPEC 5.1)
      maisRecente = s.totalCents;
    }
    return maisRecente;
  };

  const entradas: CicloHistoricoInput[] = ciclos.map((ciclo, i) => {
    const transacoes = transacoesPorCiclo[i] ?? [];
    // `paraCalculo` preserva a ordem, mas casar por índice paralelo quebra em
    // silêncio se um dia ela filtrar. Aqui a parcela vem da MESMA transação.
    const lancamentos: LancamentoHistorico[] = transacoes.map((t) => ({
      ...paraCalculo([t], grupos)[0]!,
      parcelamentoId: t.parcelamentoId,
    }));

    return {
      cicloId: ciclo.id,
      dataInicio: ciclo.dataInicio,
      dataFim: ciclo.dataFim,
      rendaPrevistaCents: ciclo.rendaPrevistaCents,
      rendaRealizadaCents: ciclo.rendaRealizadaCents,
      fixosCents: ciclo.fixosCents,
      provisaoMensalCents: ciclo.provisaoMensalCents,
      poupancaAlvoCents: ciclo.poupancaAlvoCents,
      verbaVariavelCents: ciclo.verbaVariavelCents,
      rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
      sobraCents: ciclo.sobraCents,
      lancamentos,
      patrimonioFimCents: patrimonioFimPorCiclo(ciclo.dataFim),
    };
  });

  return montarHistorico(entradas);
}
