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
  CustoFixo,
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
  projetarPoupanca,
  formatarPeriodoCiclo,
  totalPorClasseCents,
  verificarMetaIrreal,
  type TransacaoCategorizada,
  type TransacaoComMetodo,
  type FatiaCategoriaAgregada,
  type FatiaMetodoAgregada,
} from '@/domain/finance';
import { garantirCicloAtual } from './ciclos';
import { obterPatrimonio } from './patrimonio';
import type {
  EstadoPainel,
  KpisPainel,
  LinhaParcelada,
  ResumoMetas,
  ResumoPatrimonioPainel,
} from './dashboard-tipos';

const PATRIMONIO_VAZIO: ResumoPatrimonioPainel = {
  totalCents: 0,
  variacaoCents: null,
  mesesDeReserva: null,
  porClasse: [],
  curva: [],
};

export async function obterEstadoPainel(deps: Deps): Promise<EstadoPainel> {
  const { ciclo, pendenciaFechamento } = await garantirCicloAtual(deps);
  const hoje = deps.relogio.hoje();

  const [transacoes, categorias] = await Promise.all([
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
  ]);

  const kpis = montarKpis({ ciclo, hoje, transacoes, categorias });
  const categoriasFatia = montarFatiasCategoria(transacoes, categorias);
  const metodosFatia = montarFatiasMetodo(transacoes);

  const [custosFixos, provisoes, patrimonio, metas, parceladoInfo] = await Promise.all([
    montarCustosFixos(deps),
    montarProvisoes(deps),
    montarResumoPatrimonio(deps),
    montarMetas(deps, ciclo, kpis),
    montarParcelados(deps, transacoes, categorias),
  ]);

  return {
    hoje,
    ciclo,
    periodoLabel: formatarPeriodoCiclo(ciclo.dataInicio, ciclo.dataFim),
    kpis,
    categorias: categoriasFatia,
    metodos: metodosFatia,
    custosFixos,
    fixosTotalCents: ciclo.fixosCents,
    parcelados: parceladoInfo.parcelados,
    parceladosTotalCents: parceladoInfo.parceladosTotalCents,
    provisoes,
    provisaoMensalTotalCents: ciclo.provisaoMensalCents,
    patrimonio,
    metas,
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
  transacoes: readonly Transacao[];
  categorias: readonly Categoria[];
}): KpisPainel {
  const { ciclo, hoje, transacoes, categorias } = params;
  const calc = paraCalculoCategorizado(transacoes, categorias);

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
  // inteiro) e o gasto variável "solto" exclui explicitamente quem tem
  // `parcelamentoId` (`gastoVariavelSemParcelasCents`).
  const parceladosCicloCents = somarParceladosCents(calc);
  const gastoVariavelSemParcelas = gastoVariavelSemParcelasCents(calc, hoje);
  const custosFixosCents = ciclo.fixosCents;
  const rendaPrevistaCents = ciclo.rendaPrevistaCents;
  const totalGastosCents = custosFixosCents + parceladosCicloCents + gastoVariavelSemParcelas;

  return {
    restaHojeCents: teto.restaHojeCents,
    tetoHojeCents: teto.tetoHojeCents,
    gastoHojeCents: teto.gastoHojeCents,
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
    saldoContaCents: rendaPrevistaCents - totalGastosCents,
  };
}

/** Isolado do resto: uma categoria com dado inconsistente não pode derrubar o painel. */
function montarFatiasCategoria(
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
): FatiaCategoriaAgregada[] {
  try {
    const calc = paraCalculoCategorizado(transacoes, categorias);
    return agregarGastoPorCategoria(
      calc,
      categorias.map((c) => ({ id: c.id, nome: c.nome })),
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

async function montarCustosFixos(deps: Deps): Promise<CustoFixo[]> {
  try {
    return await deps.custosFixos.listarAtivos();
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
    poupancaProjetadaCents: 0,
    sobraDaVerbaCents: 0,
    progressoPercentual: 0,
    metaPoupancaPercent: null,
    avisoMetaIrreal: null,
  };
}

async function montarMetas(deps: Deps, ciclo: Ciclo, kpis: KpisPainel): Promise<ResumoMetas> {
  try {
    const config = await deps.config.obter();

    // Projeção = alvo + sobra PROJETADA pelo ritmo real (nunca saldo
    // ainda-não-gasto — ver `projetarPoupanca`, domain/finance/agregacoes.ts).
    const { poupancaProjetadaCents, progressoPercentual } = projetarPoupanca({
      poupancaAlvoCents: ciclo.poupancaAlvoCents,
      sobraProjetadaCents: kpis.sobraProjetadaCents,
    });

    const avisoMetaIrreal = config
      ? verificarMetaIrreal({
          verbaVariavelCents: ciclo.verbaVariavelCents,
          diasCiclo: kpis.diasTotais,
          pisoDiarioCents: config.pisoDiarioVerbaCents,
        })
      : null;

    return {
      poupancaAlvoCents: ciclo.poupancaAlvoCents,
      poupancaProjetadaCents,
      sobraDaVerbaCents: kpis.sobraProjetadaCents,
      progressoPercentual,
      metaPoupancaPercent: config?.metaPoupancaPercent ?? null,
      avisoMetaIrreal,
    };
  } catch (erro) {
    console.error('[dashboard] falha ao montar metas:', erro);
    return metasVazias(ciclo);
  }
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
        descricao: parcelamento.descricao,
        valorParcelaCents: t.valorCents,
        parcelaAtual: t.parcelaNum ?? 0,
        numParcelas: parcelamento.numParcelas,
        data: t.data,
        categoriaNome: t.categoriaId ? (categoriasPorId.get(t.categoriaId)?.nome ?? null) : null,
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
