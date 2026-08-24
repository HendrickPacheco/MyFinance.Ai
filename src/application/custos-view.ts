/**
 * Read-models da seção `/custos` (TASKS-CUSTOS Fase 7). Só orquestração:
 * nenhum cálculo novo mora aqui (CLAUDE.md regra 4).
 *
 * A barra de totais NÃO recalcula nada por conta própria — ela lê o ciclo 1 de
 * `obterProjecao`, que já é o ciclo congelado tal e qual está gravado, com
 * `parcelasComprometidasCents` e `verbaLivreCents` saindo do motor puro
 * (`projetarCiclos`). Recompor esses números aqui produziria um segundo
 * "quanto sobra" capaz de divergir do da tela Hoje — que é exatamente o bug
 * que a regra 4 existe para impedir.
 *
 * R4 (nada comprometido aparece como disponível): fixos, provisão e parcelas
 * são campos SEPARADOS de `verbaLivreCents`, nunca somados dentro dele.
 */
import { addDias, type DataCivil } from '@/shared/data';
import { formatarPeriodoCiclo } from '@/domain/finance';
import type { Categoria, CustoFixo, ProvisaoAnual } from '@/domain/model/entidades';
import type { Deps } from './deps';
import type { OpcaoCategoria } from './dashboard-tipos';
import { obterProjecao } from './projecao';
import { previaRecalculoCicloAtual, type PreviaRecalculo } from './ciclos';
import { listarCustosFixos, listarProvisoes } from './custos';
import { GRUPOS_DE_CATEGORIA_DE_CUSTO_FIXO } from './categoria-custo-fixo';

/**
 * Os quatro números que a barra de totais compara, mais o rótulo do período.
 * Cada um vem do seu próprio bolso — misturá-los seria violar R4.
 */
export interface ResumoMensalCustos {
  inicio: DataCivil;
  fim: DataCivil;
  /** Primeiro dia do ciclo seguinte: a data em que uma mudança de cadastro passa a valer. */
  proximoInicio: DataCivil;
  /** "1 ago — 31 ago". */
  periodoLabel: string;
  fixosCents: number;
  provisaoMensalCents: number;
  parcelasComprometidasCents: number;
  /** Verba do ciclo congelada como está gravada — o número do banner. */
  verbaVariavelCents: number;
  /** `verbaVariavel − parcelasComprometidas`. O que sobra de verdade (D-11). */
  verbaLivreCents: number;
}

/**
 * Ciclo 1 da projeção = ciclo atual congelado. Uma chamada só; `obterProjecao`
 * já lê config, ciclo, custos, provisões, parcelas e cadastro de parcelamento
 * em consultas agregadas (sem N+1) e devolve tudo composto pelo motor.
 */
export async function obterResumoMensalCustos(deps: Deps): Promise<ResumoMensalCustos> {
  const { ciclos } = await obterProjecao(deps, { numCiclos: 1 });
  const ciclo = ciclos[0];
  if (!ciclo) {
    // `projetarCiclos` com `numCiclos: 1` sempre emite um ciclo; este ramo só
    // existe para não usar `!` num índice de array sob `noUncheckedIndexedAccess`.
    throw new Error('Não foi possível projetar o ciclo atual.');
  }

  return {
    inicio: ciclo.inicio,
    fim: ciclo.fim,
    proximoInicio: addDias(ciclo.fim, 1),
    periodoLabel: formatarPeriodoCiclo(ciclo.inicio, ciclo.fim),
    fixosCents: ciclo.fixosCents,
    provisaoMensalCents: ciclo.provisaoMensalCents,
    parcelasComprometidasCents: ciclo.parcelasComprometidasCents,
    verbaVariavelCents: ciclo.verbaVariavelCents,
    verbaLivreCents: ciclo.verbaLivreCents,
  };
}

/** Um custo fixo com a única informação extra que a tela não consegue derivar sozinha. */
export interface LinhaCustoFixoGestao {
  custo: CustoFixo;
  /**
   * Em quantos ciclos ele já foi marcado como pago. `> 0` significa que a FK
   * `PagamentoFixo.custoFixoId` (Restrict) recusaria a exclusão — a UI então
   * nem oferece o botão de excluir (§4.1).
   */
  ciclosComPagamento: number;
  /**
   * Nome da categoria, quando há uma. A tela tem só o id — resolver isto no
   * cliente exigiria uma segunda fonte de verdade. `null` cobre tanto "sem
   * categoria" quanto "categoria apagada" (a FK é SET NULL, então na prática o
   * id nem sobrevive à exclusão).
   */
  categoriaNome: string | null;
}

export interface EstadoCustosFixos {
  linhas: readonly LinhaCustoFixoGestao[];
  provisoes: readonly ProvisaoAnual[];
  /** `null` quando não há ciclo aberto — sem ciclo não há delta a mostrar. */
  previaRecalculo: PreviaRecalculo | null;
  /**
   * Categorias oferecidas no formulário, FIXO primeiro. A lista é filtrada
   * pelos MESMOS grupos que `validarCategoriaDeCustoFixo` aceita — oferecer
   * aqui uma opção que o servidor vai recusar é a mesma classe de defeito do
   * botão "excluir" impossível do §4.1.
   */
  categorias: readonly OpcaoCategoria[];
}

/**
 * Tudo o que `/custos/fixos` precisa, em consultas de tamanho fixo: a lista de
 * custos, a lista de provisões, a contagem de pagamentos AGRUPADA (uma query,
 * não uma por custo) e a prévia do recálculo para o `ConfirmInline` do banner.
 */
export async function obterEstadoCustosFixos(deps: Deps): Promise<EstadoCustosFixos> {
  const [custos, provisoes, contagem, previaRecalculo, categorias] = await Promise.all([
    listarCustosFixos(deps),
    listarProvisoes(deps),
    deps.pagamentosFixos.contarPorCustoFixoAgrupado(),
    previaRecalculoCicloAtual(deps),
    deps.categorias.listar(),
  ]);

  const nomePorId = new Map(categorias.map((c) => [c.id, c.nome]));

  return {
    linhas: custos.map((custo) => ({
      custo,
      ciclosComPagamento: contagem[custo.id] ?? 0,
      categoriaNome: custo.categoriaId ? (nomePorId.get(custo.categoriaId) ?? null) : null,
    })),
    provisoes,
    previaRecalculo,
    categorias: categorias
      .filter((c) => GRUPOS_DE_CATEGORIA_DE_CUSTO_FIXO.includes(c.grupo))
      .sort(porGrupoDeCustoFixoDepoisPorOrdem)
      .map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo })),
  };
}

/**
 * FIXO antes de VARIAVEL, e dentro de cada grupo a ordem que o dono definiu no
 * cadastro. O grupo natural de um custo fixo aparece primeiro no select; as
 * variáveis ficam no fim como alternativa, não como sugestão.
 */
function porGrupoDeCustoFixoDepoisPorOrdem(a: Categoria, b: Categoria): number {
  const posicao = (c: Categoria) => GRUPOS_DE_CATEGORIA_DE_CUSTO_FIXO.indexOf(c.grupo);
  return posicao(a) - posicao(b) || a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR');
}
