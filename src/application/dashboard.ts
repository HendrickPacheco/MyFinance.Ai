/**
 * Read-model do painel desktop (`/`, SPEC 7 adaptada ao layout desktop).
 * Orquestra o motor de cálculo e as portas para montar `EstadoPainel` numa
 * consulta só. Nenhum cálculo mora aqui — só composição.
 *
 * Contrato de resiliência: só a base do ciclo atual (KPIs, categorias,
 * métodos) pode legitimamente lançar — sem ela não existe painel possível.
 * Todo bloco não essencial (patrimônio, metas, parcelados, custos fixos,
 * provisões) roda isolado e degrada para o valor vazio do contrato em vez de
 * derrubar a página inteira quando falha (ex.: patrimônio sem snapshot,
 * config incompleta).
 */
import type { Deps } from './deps';
import type {
  Categoria,
  Ciclo,
  Config,
  ProvisaoAnual,
  Transacao,
} from '@/domain/model/entidades';
import {
  calcularTeto,
  indicadoresRitmo,
  agregarGastoPorCategoria,
  agregarSaidaPorMetodo,
  sobraProjetadaCents,
  somarParceladosCents,
  gastoVariavelSemParcelasCents,
  extratoTransacoesVariaveis,
  somarProgramadosCents,
  ordenarCategoriasPorUso,
  formatarPeriodoCiclo,
  totalPorClasseCents,
  fixoVencido,
  resumoPagamentosCents,
  provisaoMensalCents,
  divergenciaCongelado,
  type TransacaoCategorizada,
  type TransacaoComMetodo,
  type TransacaoParaExtrato,
  type FatiaCategoriaAgregada,
  type FatiaMetodoAgregada,
  type LinhaTransacaoVariavelCalc,
  type ResultadoTeto,
  type RendaLiquida,
  rendaEfetivaCents,
  rendaLiquidaPrevista,
  estimarPoupancaEmCurso,
  compararComMeta,
  explicarPiso,
  projetarDiaADiaDiarioCents,
} from '@/domain/finance';
import { consumoVerbasDoCiclo } from './hoje';
import { lerInsumosPoupanca } from './fechamento';
import { formatBRL } from '@/shared/dinheiro';
import { garantirCicloAtual, lerCicloAtual, type CicloResolvido } from './ciclos';
import { obterPatrimonio } from './patrimonio';
import type {
  EstadoPainel,
  KpisPainel,
  LinhaCustoFixo,
  LinhaParcelada,
  OpcaoCategoria,
  ResumoMetas,
  ResumoPatrimonioPainel,
  ResumoRendaCiclo,
} from './dashboard-tipos';

const PATRIMONIO_VAZIO: ResumoPatrimonioPainel = {
  totalCents: 0,
  variacaoCents: null,
  mesesDeReserva: null,
  porClasse: [],
  curva: [],
};

export async function obterEstadoPainel(deps: Deps): Promise<EstadoPainel> {
  return montar(deps, await garantirCicloAtual(deps));
}

/** Sem efeito colateral: não cria ciclo. `null` quando não há ciclo aberto. */
export async function obterEstadoPainelSomenteLeitura(deps: Deps): Promise<EstadoPainel | null> {
  const resolvido = await lerCicloAtual(deps);
  return resolvido ? montar(deps, resolvido) : null;
}

async function montar(
  deps: Deps,
  { ciclo, pendenciaFechamento }: CicloResolvido,
): Promise<EstadoPainel> {
  const hoje = deps.relogio.hoje();

  const [transacoes, categorias, config] = await Promise.all([
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
    deps.config.obter(),
  ]);

  // Custos fixos (com pago/vencido) e parcelas (com pago) precisam existir
  // ANTES dos KPIs: `faltaPagarCents`/`jaPagueiCents` são derivados deles.
  const [custosFixos, parceladoInfo] = await Promise.all([
    montarCustosFixos(deps, ciclo, hoje),
    montarParcelados(deps, transacoes, categorias),
  ]);

  // Base única para os cálculos que dependem da mesma leitura do ciclo: o
  // motor de teto (`calcularTeto`), o "total de gastos" dos KPIs e o extrato
  // de gasto variável do painel PRECISAM concordar sobre o mesmo número —
  // por isso `gastoVariavelSemParcelas` é calculado uma única vez aqui e
  // repassado, em vez de cada bloco recalcular a partir do zero.
  const calc = paraCalculoCategorizado(transacoes, categorias);
  const gastoVariavelSemParcelas = gastoVariavelSemParcelasCents(calc, hoje);

  const pisoDiarioCents = config?.pisoDiarioVerbaCents ?? 0;
  const consumo = consumoVerbasDoCiclo({ ciclo, transacoes, categorias, pisoDiarioCents, hoje });

  const kpis = montarKpis({
    ciclo,
    hoje,
    tetoDiaADia: consumo.tetoDiaADia,
    calc,
    gastoVariavelSemParcelas,
    custosFixos,
    parcelados: parceladoInfo.parcelados,
  });
  const categoriasFatia = montarFatiasCategoria(transacoes, categorias, hoje);
  const metodosFatia = montarFatiasMetodo(transacoes);
  const categoriasLancamento = montarCategoriasLancamento(transacoes, categorias);
  // Extrato até o FIM do ciclo (não até hoje): competência futura já lançada
  // aparece marcada como programada. Ver `montarExtratoVariavel`.
  const transacoesVariaveis = montarExtratoVariavel(transacoes, categorias, hoje, ciclo.dataFim);

  const [provisoes, patrimonio, metas] = await Promise.all([
    montarProvisoes(deps),
    montarResumoPatrimonio(deps),
    montarMetas(deps, { ciclo, kpis, config, hoje }),
  ]);

  const verbas = {
    ...consumo,
    pisoDiarioCents,
    diaADiaPorDiaCents: projetarDiaADiaDiarioCents(consumo, consumo.extrasUsadoCents, kpis.diasTotais),
  };

  return {
    hoje,
    ciclo,
    periodoLabel: formatarPeriodoCiclo(ciclo.dataInicio, ciclo.dataFim),
    kpis,
    categorias: categoriasFatia,
    metodos: metodosFatia,
    custosFixos,
    fixosTotalCents: ciclo.fixosCents,
    divergenciaFixos: divergenciaCongelado(
      ciclo.fixosCents,
      custosFixos.reduce((total, c) => total + c.valorCents, 0),
      'CUSTO_FIXO',
    ),
    parcelados: parceladoInfo.parcelados,
    parceladosTotalCents: parceladoInfo.parceladosTotalCents,
    provisoes,
    provisaoMensalTotalCents: ciclo.provisaoMensalCents,
    divergenciaProvisao: divergenciaCongelado(
      ciclo.provisaoMensalCents,
      provisaoMensalCents(provisoes.filter((p) => p.ativo).map((p) => p.valorAnualCents)),
      'PROVISAO',
    ),
    categoriasLancamento,
    transacoesVariaveis,
    // Mesmo valor usado em `kpis.totalGastosCents` (via `gastoVariavelSemParcelas`
    // acima) — nunca recalculado à parte, para os dois números nunca divergirem.
    // Soma só o REALIZADO: as linhas programadas do extrato ficam fora, no
    // campo separado abaixo (competência futura não consome verba, SPEC 5.1).
    transacoesVariaveisTotalCents: gastoVariavelSemParcelas,
    transacoesVariaveisProgramadasCents: somarProgramadosCents(transacoesVariaveis),
    patrimonio,
    metas,
    verbas,
    renda: montarRenda(ciclo, config),
    pendenciaFechamento,
  };
}

/** Forma mínima categorizada que o motor de cálculo consome, com categoriaId e parcelamentoId preservados. */
function paraCalculoCategorizado(
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
): (TransacaoCategorizada & { parcelamentoId: string | null })[] {
  const gruposPorCategoria = new Map(categorias.map((c) => [c.id, c.grupo]));
  return transacoes.map((t) => ({
    data: t.data,
    valorCents: t.valorCents,
    tipo: t.tipo,
    grupoCategoria: t.categoriaId ? (gruposPorCategoria.get(t.categoriaId) ?? null) : null,
    provisaoId: t.provisaoId,
    categoriaId: t.categoriaId,
    parcelamentoId: t.parcelamentoId,
  }));
}

function montarKpis(params: {
  ciclo: Ciclo;
  hoje: string;
  /** "Posso gastar hoje" é SEMPRE o dia a dia (D1) — um número só no app inteiro. */
  tetoDiaADia: ResultadoTeto;
  calc: readonly (TransacaoCategorizada & { parcelamentoId: string | null })[];
  gastoVariavelSemParcelas: number;
  custosFixos: readonly LinhaCustoFixo[];
  parcelados: readonly LinhaParcelada[];
}): KpisPainel {
  const { ciclo, hoje, tetoDiaADia, calc, gastoVariavelSemParcelas, custosFixos, parcelados } = params;

  const teto = calcularTeto({
    verbaVariavelCents: ciclo.verbaVariavelCents,
    dataFimCiclo: ciclo.dataFim,
    hoje,
    transacoes: calc,
  });

  const gastoRealizadoCents = teto.gastoAntesDeHojeCents + teto.gastoHojeCents;
  const saldoDisponivelCents = teto.saldoDisponivelCents - teto.gastoHojeCents;

  const ritmo = indicadoresRitmo({
    verbaVariavelCents: ciclo.verbaVariavelCents,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    hoje,
    gastoRealizadoCents,
  });

  // Parcelas são `Transacao` de grupo VARIAVEL, então já entrariam em
  // `gastoRealizadoCents` acima quando a competência é hoje ou passada. Para
  // montar "total de gastos" (fixos + parcelas + variável) sem contar a
  // mesma parcela duas vezes, soma-se as parcelas à parte
  // (`somarParceladosCents`, sem filtro de data — compromisso do mês
  // inteiro); `gastoVariavelSemParcelas` já vem pronto do chamador (mesmo
  // valor usado em `transacoesVariaveisTotalCents`, para nunca divergir).
  const parceladosCicloCents = somarParceladosCents(calc);
  const custosFixosCents = ciclo.fixosCents;
  const rendaPrevistaCents = rendaEfetivaCents(ciclo);
  const totalGastosCents = custosFixosCents + parceladosCicloCents + gastoVariavelSemParcelas;

  // RASTREAMENTO puro (SPEC regra 5): soma o que falta pagar/já foi pago só
  // para exibição. Não entra em nenhum dos campos de verba/teto acima —
  // ver `src/domain/finance/pagamentos.ts`.
  const { faltaPagarCents, jaPagueiCents } = resumoPagamentosCents(
    custosFixos.map((c) => ({ valorCents: c.valorCents, pago: c.pago })),
    parcelados.map((p) => ({ valorCents: p.valorParcelaCents, pago: p.pago })),
  );

  return {
    restaHojeCents: tetoDiaADia.restaHojeCents,
    tetoHojeCents: tetoDiaADia.tetoHojeCents,
    gastoHojeCents: tetoDiaADia.gastoHojeCents,
    saldoDiaADiaCents: tetoDiaADia.saldoDisponivelCents,
    verbaVariavelCents: ciclo.verbaVariavelCents,
    gastoRealizadoCents,
    saldoDisponivelCents,
    diasRestantes: teto.diasRestantes,
    diasTotais: ritmo.diasTotaisCiclo,
    sobraProjetadaCents: sobraProjetadaCents({
      verbaVariavelCents: ciclo.verbaVariavelCents,
      ritmo,
    }),
    emRecuperacao: teto.emRecuperacao,
    rendaPrevistaCents,
    custosFixosCents,
    parceladosCicloCents,
    totalGastosCents,
    metaEconomiaCents: ciclo.poupancaAlvoCents,
    faltaPagarCents,
    jaPagueiCents,
    saldoContaCents: rendaPrevistaCents - totalGastosCents,
  };
}

/**
 * Fatias da pizza de categorias. Corta em `hoje` (mesmo predicado e mesmo
 * corte de `gastoRealizadoCents`): a soma das fatias é a decomposição exata do
 * KPI de gasto realizado e do rodapé "Realizado até hoje" do extrato. O que
 * ainda não aconteceu aparece marcado no extrato, nunca calado num gráfico.
 *
 * Isolado do resto: uma categoria com dado inconsistente não pode derrubar o painel.
 */
function montarFatiasCategoria(
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
  hoje: string,
): FatiaCategoriaAgregada[] {
  try {
    const calc = paraCalculoCategorizado(transacoes, categorias);
    return agregarGastoPorCategoria(
      calc,
      categorias.map((c) => ({ id: c.id, nome: c.nome })),
      hoje,
    );
  } catch (erro) {
    console.error('[dashboard] falha ao agregar gasto por categoria:', erro);
    return [];
  }
}

function montarFatiasMetodo(transacoes: readonly Transacao[]): FatiaMetodoAgregada[] {
  try {
    const comMetodo: TransacaoComMetodo[] = transacoes.map((t) => ({
      tipo: t.tipo,
      valorCents: t.valorCents,
      metodo: t.metodo,
    }));
    return agregarSaidaPorMetodo(comMetodo);
  } catch (erro) {
    console.error('[dashboard] falha ao agregar saída por método:', erro);
    return [];
  }
}

/**
 * Categorias para o formulário de lançamento rápido do painel: VARIAVEL
 * primeiro por frequência real de uso no ciclo, resto por `ordem`
 * (`ordenarCategoriasPorUso`, domain/finance/categorias.ts — a MESMA função
 * que a tela Hoje usa para as 6 categorias rápidas, para as duas telas nunca
 * divergirem no ranking). Isolado do resto: cadastro de categoria
 * inconsistente não pode derrubar o painel.
 */
function montarCategoriasLancamento(
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
): OpcaoCategoria[] {
  try {
    return ordenarCategoriasPorUso(categorias, transacoes).map((c) => ({
      id: c.id,
      nome: c.nome,
      grupo: c.grupo,
    }));
  } catch (erro) {
    console.error('[dashboard] falha ao montar categorias de lançamento:', erro);
    return [];
  }
}

/**
 * Extrato de gasto variável do ciclo para o painel: mesma regra de
 * `contaComoVerbaVariavel` usada pelo teto e pelo KPI `totalGastosCents`
 * (via `extratoTransacoesVariaveis`, domain/finance/agregacoes.ts) — exclui
 * parcelas, gasto de provisão, RENDA e TRANSFERENCIA; ESTORNO entra marcado
 * com `ehEstorno`. Isolado do resto: transação com dado malformado não pode
 * derrubar o painel.
 *
 * Vai até `ateData` (= fim do ciclo), não até `hoje`: transação com competência
 * futura dentro do ciclo entra marcada com `ehProgramado`. Cortar em `hoje`
 * fazia ela sumir do painel inteiro — não é custo fixo, não é parcela, não é
 * provisão — enquanto seguia visível no extrato da tela Ciclo e nos gráficos
 * de categoria/método (que não filtram por data). O total continua sendo só o
 * realizado; o programado vai em `transacoesVariaveisProgramadasCents`.
 */
function montarExtratoVariavel(
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
  hoje: string,
  ateData: string,
): LinhaTransacaoVariavelCalc[] {
  try {
    const gruposPorCategoria = new Map(categorias.map((c) => [c.id, c.grupo]));
    const nomesPorCategoria = new Map(categorias.map((c) => [c.id, c.nome]));

    const paraExtrato: TransacaoParaExtrato[] = transacoes.map((t) => ({
      transacaoId: t.id,
      data: t.data,
      valorCents: t.valorCents,
      tipo: t.tipo,
      grupoCategoria: t.categoriaId ? (gruposPorCategoria.get(t.categoriaId) ?? null) : null,
      provisaoId: t.provisaoId,
      parcelamentoId: t.parcelamentoId,
      descricao: t.descricao,
      categoriaId: t.categoriaId,
      categoriaNome: t.categoriaId ? (nomesPorCategoria.get(t.categoriaId) ?? null) : null,
      metodo: t.metodo,
    }));

    return extratoTransacoesVariaveis(paraExtrato, hoje, { ate: ateData });
  } catch (erro) {
    console.error('[dashboard] falha ao montar extrato de gasto variável:', erro);
    return [];
  }
}

/**
 * Junta os custos fixos ativos com o rastreamento de pagamento DESTE ciclo
 * (`PagamentoFixo`, único por (custoFixoId, cicloId) — reseta sozinho na
 * virada). "Vencido" é derivado por `fixoVencido` (domain/finance/pagamentos):
 * vencimento dentro do ciclo já passou e ninguém marcou como pago. Isolado
 * do resto: um vencimento malformado não pode derrubar o painel.
 */
async function montarCustosFixos(deps: Deps, ciclo: Ciclo, hoje: string): Promise<LinhaCustoFixo[]> {
  try {
    const [custos, pagamentos] = await Promise.all([
      deps.custosFixos.listarAtivos(),
      deps.pagamentosFixos.listarPorCiclo(ciclo.id),
    ]);
    const custoFixoIdsPagos = new Set(pagamentos.map((p) => p.custoFixoId));

    return custos.map((custo) => {
      const pago = custoFixoIdsPagos.has(custo.id);
      return {
        custoFixoId: custo.id,
        nome: custo.nome,
        valorCents: custo.valorCents,
        diaVencimento: custo.diaVencimento,
        pago,
        vencido: fixoVencido({
          hoje,
          cicloInicio: ciclo.dataInicio,
          cicloFim: ciclo.dataFim,
          diaVencimento: custo.diaVencimento,
          pago,
        }),
      };
    });
  } catch (erro) {
    console.error('[dashboard] falha ao listar custos fixos:', erro);
    return [];
  }
}

async function montarProvisoes(deps: Deps): Promise<ProvisaoAnual[]> {
  try {
    return await deps.provisoes.listarAtivas();
  } catch (erro) {
    console.error('[dashboard] falha ao listar provisões:', erro);
    return [];
  }
}

async function montarResumoPatrimonio(deps: Deps): Promise<ResumoPatrimonioPainel> {
  try {
    const patrimonio = await obterPatrimonio(deps);
    const maisRecente = patrimonio.snapshots[0] ?? null;
    const temComparacao = patrimonio.snapshots.length >= 2;

    return {
      totalCents: patrimonio.totalAtualCents,
      variacaoCents: temComparacao ? patrimonio.variacaoMensalCents : null,
      // `patrimonio.mesesDeReserva` já é `null` quando não há histórico de
      // custo suficiente (ver `mesesDeReserva` em domain/finance/patrimonio.ts)
      // — reserva em conta independe de snapshot registrado, então não há
      // gate adicional por `temDados` aqui.
      mesesDeReserva: patrimonio.mesesDeReserva,
      porClasse: maisRecente ? totalPorClasseCents(maisRecente.itens) : [],
      curva: patrimonio.curva,
    };
  } catch (erro) {
    console.error('[dashboard] falha ao montar o bloco de patrimônio:', erro);
    return PATRIMONIO_VAZIO;
  }
}

function metasVazias(ciclo: Ciclo): ResumoMetas {
  return {
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    guardadoCents: null,
    estimado: true,
    fonte: null,
    motivoSemGuardado: 'Não foi possível ler o patrimônio agora.',
    diferencaCents: null,
    percentualReal: null,
    sobraDaVerbaCents: 0,
    metaPoupancaPercent: null,
    avisoPiso: null,
  };
}

/**
 * Meta vs. guardado de verdade (D3): variação do patrimônio desde o início do
 * ciclo, estimada pelo snapshot mais recente ou, sem ele, pelo saldo das
 * contas que entram no patrimônio. A meta é só a régua (D-16).
 */
async function montarMetas(
  deps: Deps,
  p: { ciclo: Ciclo; kpis: KpisPainel; config: Config | null; hoje: string },
): Promise<ResumoMetas> {
  const { ciclo, kpis, config, hoje } = p;
  try {
    const [insumos, contas] = await Promise.all([lerInsumosPoupanca(deps, ciclo), deps.contas.listar()]);
    const estimativa = estimarPoupancaEmCurso({
      dataInicio: ciclo.dataInicio,
      hoje,
      snapshots: insumos.snapshots,
      saldoContasCents: contas
        .filter((c) => c.incluiPatrimonio && !c.arquivada)
        .reduce((total, c) => total + c.saldoCents, 0),
      patrimonioFinalCicloAnteriorCents: insumos.patrimonioFinalCicloAnteriorCents,
    });

    const base = {
      poupancaAlvoCents: ciclo.poupancaAlvoCents,
      estimado: true as const,
      sobraDaVerbaCents: kpis.sobraProjetadaCents,
      metaPoupancaPercent: config?.metaPoupancaPercent ?? null,
      avisoPiso: config
        ? explicarPiso({
            verbaVariavelCents: ciclo.verbaVariavelCents,
            poupancaAlvoCents: ciclo.poupancaAlvoCents,
            parcelasCents: kpis.parceladosCicloCents,
            pisoDiarioCents: config.pisoDiarioVerbaCents,
            diasCiclo: kpis.diasTotais,
            rendaPrevistaCents: ciclo.rendaPrevistaCents,
            rendaRealLiquidaCents: ciclo.rendaRealLiquidaCents,
          })
        : null,
    };

    if (estimativa.realCents === null) {
      return {
        ...base,
        guardadoCents: null,
        fonte: null,
        motivoSemGuardado: estimativa.motivo,
        diferencaCents: null,
        percentualReal: null,
      };
    }
    const comparacao = compararComMeta(estimativa.realCents, ciclo.poupancaAlvoCents);
    return {
      ...base,
      guardadoCents: estimativa.realCents,
      fonte: estimativa.fonte,
      motivoSemGuardado: null,
      diferencaCents: comparacao.diferencaCents,
      percentualReal: comparacao.percentual,
    };
  } catch (erro) {
    console.error('[dashboard] falha ao montar metas:', erro);
    return metasVazias(ciclo);
  }
}

/**
 * Renda do ciclo (D8): a real confirmada quando houver, senão a prevista. A
 * decomposição sai de `rendaLiquidaPrevista` com uma Config sintética (como a
 * confirmação faz) — uma implementação só da conta e do texto.
 */
export function montarRenda(ciclo: Ciclo, config: Config | null): ResumoRendaCiclo {
  const liquidaCents = rendaEfetivaCents(ciclo);
  const confirmada = ciclo.rendaRealLiquidaCents != null;
  const semImposto = { impostoEstimadoCents: null, impostoEstimadoPercentual: null };
  const emReais = {
    ...semImposto,
    moedaRenda: 'BRL' as const,
    rendaBaseCents: liquidaCents,
    rendaBrutaMoedaOrigemCents: null,
  };

  let renda: Pick<RendaLiquida, 'moeda' | 'brutaOrigemCents' | 'taxaMicros' | 'dataCotacao' | 'decomposicao'>;
  try {
    if (confirmada) {
      const { rendaRealBrutaMoedaOrigemCents: bruta, cotacaoRealUsadaMicros: taxa } = ciclo;
      renda =
        bruta != null && taxa != null
          ? rendaLiquidaPrevista(
              {
                ...semImposto,
                moedaRenda: 'USD',
                rendaBaseCents: liquidaCents,
                rendaBrutaMoedaOrigemCents: bruta,
                impostoEstimadoCents: ciclo.impostoRealCents ?? 0,
              },
              // A renda real não guarda a data da cotação; `dataCotacao` sai null abaixo.
              { data: ciclo.dataFim, taxaMicros: taxa },
            )
          : rendaLiquidaPrevista(emReais, null);
    } else if (ciclo.cotacaoPrevistaMicros == null || ciclo.cotacaoPrevistaData == null) {
      // Moeda vem do CICLO: sem cotação congelada ele nasceu em reais.
      renda = rendaLiquidaPrevista(emReais, null);
    } else {
      const recalculada = config
        ? rendaLiquidaPrevista(
            { ...config, moedaRenda: 'USD', rendaBaseCents: liquidaCents },
            { data: ciclo.cotacaoPrevistaData, taxaMicros: ciclo.cotacaoPrevistaMicros },
          )
        : null;
      // D-15: a decomposição só vale se reproduz o líquido congelado. Config
      // editada no meio do ciclo (bruta/imposto/moeda) a deixaria mentindo.
      renda =
        recalculada && recalculada.taxaMicros !== null && recalculada.liquidaCents === liquidaCents
          ? recalculada
          : {
              moeda: 'USD' as const,
              brutaOrigemCents: null,
              taxaMicros: null,
              dataCotacao: null,
              decomposicao:
                `${formatBRL(liquidaCents)} (renda congelada no início do ciclo; a configuração mudou ` +
                `desde então — "Recalcular renda deste ciclo" atualiza)`,
            };
    }
  } catch (erro) {
    // Config de imposto inválida (RangeError): degrada para o líquido em reais.
    console.error('[dashboard] falha ao decompor a renda do ciclo:', erro);
    renda = rendaLiquidaPrevista(emReais, null);
  }

  return {
    moeda: renda.moeda,
    brutaOrigemCents: renda.brutaOrigemCents,
    taxaMicros: renda.taxaMicros,
    dataCotacao: confirmada ? null : renda.dataCotacao,
    liquidaCents,
    confirmada,
    decomposicao: renda.decomposicao,
  };
}

async function montarParcelados(
  deps: Deps,
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
): Promise<{ parcelados: LinhaParcelada[]; parceladosTotalCents: number }> {
  try {
    const transacoesParceladas = transacoes.filter(
      (t): t is Transacao & { parcelamentoId: string } => t.parcelamentoId != null,
    );
    if (transacoesParceladas.length === 0) {
      return { parcelados: [], parceladosTotalCents: 0 };
    }

    const categoriasPorId = new Map(categorias.map((c) => [c.id, c]));
    const idsUnicos = [...new Set(transacoesParceladas.map((t) => t.parcelamentoId))];
    const parcelamentos = await deps.parcelamentos.listarPorIds(idsUnicos);
    const parcelamentosPorId = new Map(parcelamentos.map((p) => [p.id, p]));

    const linhas: LinhaParcelada[] = [];

    for (const t of transacoesParceladas) {
      const parcelamento = parcelamentosPorId.get(t.parcelamentoId);
      if (!parcelamento) continue; // referência órfã: degrada omitindo a linha, não quebra o painel

      linhas.push({
        parcelamentoId: parcelamento.id,
        transacaoId: t.id,
        descricao: parcelamento.descricao,
        valorParcelaCents: t.valorCents,
        parcelaAtual: t.parcelaNum ?? 0,
        numParcelas: parcelamento.numParcelas,
        data: t.data,
        categoriaNome: t.categoriaId ? (categoriasPorId.get(t.categoriaId)?.nome ?? null) : null,
        pago: t.pagoEm != null,
      });
    }

    linhas.sort((a, b) => a.data.localeCompare(b.data));
    // Mesma função pura que monta `kpis.parceladosCicloCents` — garante que os
    // dois números nunca divirjam sem reconsultar o banco.
    return { parcelados: linhas, parceladosTotalCents: somarParceladosCents(transacoesParceladas) };
  } catch (erro) {
    console.error('[dashboard] falha ao montar parcelamentos:', erro);
    return { parcelados: [], parceladosTotalCents: 0 };
  }
}
