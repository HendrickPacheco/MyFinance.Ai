/**
 * Read-model da tela Hoje (SPEC 7.1). Devolve exatamente os números que a
 * tela mostra e as categorias para o lançamento rápido (6 mais usadas por
 * frequência real). Nenhum cálculo aqui — só orquestra o motor.
 */
import type { Deps } from './deps';
import type { Categoria, Ciclo, Transacao } from '@/domain/model/entidades';
import {
  calcularTeto,
  avaliarRecuperacao,
  ordenarCategoriasPorUso,
  dividirVerba,
  consumirVerbas,
  diasTotaisCiclo,
  type ConsumoVerbas,
  type ResultadoTeto,
  type SaidaRecuperacao,
} from '@/domain/finance';
import { garantirCicloAtual, lerCicloAtual, type CicloResolvido } from './ciclos';
import { indexarGrupoCategoria, paraCalculo, paraCalculoVerba } from './mapeamento';

export interface EstadoHoje {
  hoje: string;
  ciclo: Ciclo;
  teto: ResultadoTeto;
  /** Verba do dia a dia (D1): o "Posso gastar hoje" do mobile é `diaADia.tetoDiaADia`. */
  diaADia: ConsumoVerbas;
  recuperacao: SaidaRecuperacao;
  restaNoCicloCents: number;
  categoriasRapidas: Categoria[];
  transacoesHoje: Transacao[];
  pendenciaFechamento: Ciclo | null;
}

export async function obterEstadoHoje(deps: Deps): Promise<EstadoHoje> {
  return montar(deps, await garantirCicloAtual(deps));
}

/**
 * Mesma leitura, sem efeito colateral: não cria ciclo. Devolve `null` quando
 * não há ciclo aberto, em vez de abrir um. É o que o copiloto usa — responder
 * uma pergunta não pode gravar no banco (decisão D-8).
 */
export async function obterEstadoHojeSomenteLeitura(deps: Deps): Promise<EstadoHoje | null> {
  const resolvido = await lerCicloAtual(deps);
  return resolvido ? montar(deps, resolvido) : null;
}

async function montar(
  deps: Deps,
  { ciclo, pendenciaFechamento }: CicloResolvido,
): Promise<EstadoHoje> {
  const hoje = deps.relogio.hoje();

  const [transacoes, categorias, config] = await Promise.all([
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
    deps.config.obter(),
  ]);

  const grupos = indexarGrupoCategoria(categorias);
  const calc = paraCalculo(transacoes, grupos);

  const teto = calcularTeto({
    verbaVariavelCents: ciclo.verbaVariavelCents,
    dataFimCiclo: ciclo.dataFim,
    hoje,
    transacoes: calc,
  });

  const diaADia = consumoVerbasDoCiclo({
    ciclo,
    transacoes,
    categorias,
    pisoDiarioCents: config?.pisoDiarioVerbaCents ?? 0,
    hoje,
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
    diaADia,
    recuperacao,
    restaNoCicloCents,
    categoriasRapidas,
    transacoesHoje,
    pendenciaFechamento,
  };
}

/**
 * Top N categorias VARIAVEL por frequência de uso no ciclo; completa por
 * ordem. `ordenarCategoriasPorUso` (domain/finance/categorias.ts) já devolve
 * VARIAVEL primeiro e nesta ordem exata — aqui só filtra e corta em N para
 * não duplicar a regra de ranking.
 */
function categoriasMaisUsadas(
  categorias: readonly Categoria[],
  transacoes: readonly Transacao[],
  n: number,
): Categoria[] {
  return ordenarCategoriasPorUso(categorias, transacoes)
    .filter((c) => c.grupo === 'VARIAVEL')
    .slice(0, n);
}

/** Split dia a dia / extras do ciclo (D1) — mesma montagem para a tela Hoje e o painel. */
export function consumoVerbasDoCiclo(p: {
  ciclo: Ciclo;
  transacoes: readonly Transacao[];
  categorias: readonly Categoria[];
  pisoDiarioCents: number;
  hoje: string;
}): ConsumoVerbas {
  const divisao = dividirVerba({
    verbaVariavelCents: p.ciclo.verbaVariavelCents,
    poupancaAlvoCents: p.ciclo.poupancaAlvoCents,
    pisoDiarioCents: p.pisoDiarioCents,
    diasCiclo: diasTotaisCiclo({ inicio: p.ciclo.dataInicio, fim: p.ciclo.dataFim }),
  });
  return consumirVerbas({
    divisao,
    transacoes: paraCalculoVerba(p.transacoes, p.categorias),
    hoje: p.hoje,
    dataFimCiclo: p.ciclo.dataFim,
  });
}
