/**
 * Fechamento de ciclo (SPEC 7.2, regras 7, 8, 9). Destina a sobra, credita a
 * provisão do mês no acumulado (decisão 4), atualiza patrimônio e recalibra a
 * meta. O passo de recalibração é o mecanismo de progresso do app.
 */
import type { Deps } from './deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type { Ciclo, Config, SnapshotPatrimonio, Transacao } from '@/domain/model/entidades';
import {
  gastoRealizadoCents,
  distribuirProvisaoMensalCents,
  medirPoupancaReal,
  compararComMeta,
  alertaLancamentosFaltando,
  alertaGastoVariavelBaixo,
  rendaEfetivaCents,
  type MedicaoPoupanca,
} from '@/domain/finance';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';
import { criarSnapshot, sugestaoItensSnapshot, type ItemSnapshotInput } from './patrimonio';
import { garantirCicloAtual } from './ciclos';
import { addDias } from '@/shared/data';

/**
 * Lançada quando a sobra do ciclo precisa de uma conta de destino (RESERVA,
 * CDB, etc. — ou seja, `destinoSobra` != ROLLOVER) e nenhuma pode ser
 * determinada: nem `Config.destinoSobraContaId` aponta para uma conta
 * existente, nem há conta do tipo RESERVA para servir de destino padrão.
 * Lançada ANTES de reivindicar o fechamento atomicamente — o ciclo nunca
 * fica marcado como fechado sem que a sobra tenha um destino (SPEC regra 7).
 */
export class DestinoSobraIndefinidoError extends Error {
  constructor() {
    super(
      'Não há conta de destino para a sobra deste ciclo. Configure a conta de destino da sobra em Configurações antes de fechar.',
    );
    this.name = 'DestinoSobraIndefinidoError';
  }
}

/**
 * Resolve a conta que recebe a sobra: prioriza `destinoSobraContaId` (se
 * ainda existir); na ausência, cai numa conta RESERVA determinística (a
 * primeira ativa) — nunca deixa a sobra sem destino em silêncio.
 */
async function resolverContaDestinoSobra(
  deps: Deps,
  destinoSobraContaId: string | null,
): Promise<string | null> {
  const contas = await deps.contas.listar({ incluirArquivadas: false });

  if (destinoSobraContaId) {
    const contaConfigurada = contas.find((c) => c.id === destinoSobraContaId);
    if (contaConfigurada) return contaConfigurada.id;
  }

  const reservaPadrao = contas.find((c) => c.tipo === 'RESERVA');
  return reservaPadrao?.id ?? null;
}

/**
 * Determina para onde vai a sobra deste fechamento. Devolve `null` quando
 * não há nada a destinar (ROLLOVER fica só registrado no ciclo; sobra zero
 * não move saldo nenhum). Lança `DestinoSobraIndefinidoError` quando a sobra
 * precisa de conta e nenhuma pôde ser resolvida — nunca deixa o dinheiro
 * evaporar sem aviso.
 */
async function resolverDestinoSobraOuFalhar(
  deps: Deps,
  config: Config,
  sobraCents: number,
): Promise<string | null> {
  if (config.destinoSobra === 'ROLLOVER' || sobraCents === 0) return null;

  const contaDestinoId = await resolverContaDestinoSobra(deps, config.destinoSobraContaId);
  if (!contaDestinoId) throw new DestinoSobraIndefinidoError();
  return contaDestinoId;
}

/**
 * Lançada quando a poupança real do ciclo não pôde ser medida (sem snapshot
 * perto do início/fim, considerando o snapshot do próprio fechamento) e o dono
 * não informou um valor manual. Lançada ANTES de qualquer escrita: o ciclo
 * continua aberto — nunca fecha com poupança real 0 silenciosa.
 */
export class PoupancaRealNaoMedidaError extends Error {
  constructor(public readonly motivo: string) {
    super(`Não foi possível medir a poupança real deste ciclo: ${motivo} Informe o valor manualmente.`);
    this.name = 'PoupancaRealNaoMedidaError';
  }
}

// ponytail: janela fixa de snapshots recentes; vira consulta por intervalo de datas se o dono fotografar mais que isso por ciclo
const SNAPSHOTS_PARA_MEDICAO = 60;
const CICLOS_PARA_ALERTA_GASTO = 6;

/**
 * Snapshots recentes + patrimônio de partida de reserva (o final do ciclo fechado que
 * antecede DIRETAMENTE este). Compartilhado com o painel (`estimarPoupancaEmCurso`).
 */
export async function lerInsumosPoupanca(
  deps: Deps,
  ciclo: Pick<Ciclo, 'dataInicio'>,
): Promise<{ snapshots: SnapshotPatrimonio[]; patrimonioFinalCicloAnteriorCents: number | null }> {
  const [snapshots, anterior] = await Promise.all([
    deps.patrimonio.ultimosSnapshots(SNAPSHOTS_PARA_MEDICAO),
    deps.ciclos.ultimoFechado(),
  ]);
  return {
    snapshots,
    patrimonioFinalCicloAnteriorCents:
      anterior && addDias(anterior.dataFim, 1) === ciclo.dataInicio ? anterior.patrimonioFinalCents : null,
  };
}

/** Mede a poupança real do ciclo; `extra` é o snapshot do próprio fechamento (ainda não gravado). */
async function medirPoupancaDoCiclo(
  deps: Deps,
  ciclo: Ciclo,
  extra: { data: string; totalCents: number } | null = null,
): Promise<MedicaoPoupanca> {
  const { snapshots: salvos, patrimonioFinalCicloAnteriorCents } = await lerInsumosPoupanca(deps, ciclo);
  // O snapshot do input substitui o da mesma data ao ser gravado — espelha isso aqui.
  const snapshots = salvos.filter((s) => s.data !== extra?.data);
  if (extra) snapshots.push({ ...extra, id: '', itens: [] });
  return medirPoupancaReal({
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    snapshots,
    patrimonioFinalCicloAnteriorCents,
  });
}

export interface ResumoFechamento {
  ciclo: Ciclo;
  gastoRealizadoCents: number;
  sobraCents: number; // pode ser negativo (déficit)
  transacoesSemCategoria: Transacao[];
  metaSugeridaCents: number | null; // aumento sugerido (2 ciclos com folga)
  itensPatrimonioSugeridos: ItemSnapshotInput[];
  medicao: MedicaoPoupanca;
  comparacao: { diferencaCents: number; percentual: number | null } | null;
  alertaFaltando: { semExplicacaoCents: number; limiarCents: number } | null;
  alertaGastoBaixo: { mediaAnteriorCents: number; percentual: number } | null;
  rendaSugeridaCents: number; // renda real ?? prevista, pré-preenche o passo de renda
}

export interface FechamentoInput {
  rendaRealizadaCents: number;
  novaMetaPoupancaCents?: number | null;
  snapshotData?: string;
  snapshotItens?: ItemSnapshotInput[];
  observacao?: string | null;
  /** Poupança real informada pelo dono quando não há snapshot para medir. */
  poupancaRealManualCents?: number | null;
}

async function calcularSobra(
  deps: Deps,
  ciclo: Ciclo,
): Promise<{ gasto: number; sobra: number; grupos: ReturnType<typeof indexarGrupoCategoria> }> {
  const [transacoes, categorias] = await Promise.all([
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
  ]);
  const grupos = indexarGrupoCategoria(categorias);
  const gasto = gastoRealizadoCents(paraCalculo(transacoes, grupos), ciclo.dataFim);
  return { gasto, sobra: ciclo.verbaVariavelCents - gasto, grupos };
}

/** Preview do wizard: sobra, transações sem categoria, sugestões de meta e patrimônio. */
export async function obterResumoFechamento(
  deps: Deps,
  ciclo: Ciclo,
  /** Snapshot do fim digitado no wizard e ainda não gravado (mesma semântica do `fecharCiclo`). */
  snapshotDoFim: { data: string; totalCents: number } | null = null,
): Promise<ResumoFechamento> {
  const { gasto, sobra, grupos } = await calcularSobra(deps, ciclo);
  const transacoes = await deps.transacoes.listarPorCiclo(ciclo.id);
  const transacoesSemCategoria = transacoes.filter(
    (t) => t.tipo === 'DESPESA' && !t.categoriaId,
  );

  // Meta sugerida: se este ciclo e o anterior fechado sobraram com folga (>0), sugere subir.
  const anteriores = await deps.ciclos.ultimosFechados(1);
  const anterior = anteriores[0];
  let metaSugeridaCents: number | null = null;
  // D-16: a sobra NÃO é um extra em cima da meta — ela É a poupança do ciclo,
  // porque a meta não é mais descontada da verba. Somar as duas sugeriria uma
  // meta que ninguém nunca atingiu. A sugestão é a menor sobra das duas, e só
  // quando ela supera a meta vigente (senão seria sugerir baixar a meta por ter
  // gasto muito, que é o incentivo invertido).
  if (sobra > 0 && anterior && (anterior.sobraCents ?? 0) > 0) {
    const menorSobra = Math.min(sobra, anterior.sobraCents ?? 0);
    if (menorSobra > ciclo.poupancaAlvoCents) metaSugeridaCents = menorSobra;
  }

  const itensPatrimonioSugeridos = await sugestaoItensSnapshot(deps);

  const medicao = await medirPoupancaDoCiclo(deps, ciclo, snapshotDoFim);
  const rendaSugeridaCents = rendaEfetivaCents(ciclo);
  // Despesas lançadas = DESPESA − ESTORNO de TODAS as transações do ciclo
  // (variável, parcela, provisão): o alerta pergunta se falta lançar algo.
  // Categoria FIXO fica de fora: já entra como `fixosCents` (R1, senão conta duas vezes).
  const despesasLancadasCents = transacoes.reduce((s, t) => {
    if (t.categoriaId && grupos.get(t.categoriaId) === 'FIXO') return s;
    return s + (t.tipo === 'DESPESA' ? t.valorCents : t.tipo === 'ESTORNO' ? -t.valorCents : 0);
  }, 0);
  const fechadosRecentes = await deps.ciclos.ultimosFechados(CICLOS_PARA_ALERTA_GASTO);
  const gastosAnterioresCents = fechadosRecentes
    .filter((c) => c.sobraCents !== null)
    .map((c) => c.verbaVariavelCents - (c.sobraCents ?? 0));

  return {
    ciclo,
    gastoRealizadoCents: gasto,
    sobraCents: sobra,
    transacoesSemCategoria,
    metaSugeridaCents,
    itensPatrimonioSugeridos,
    medicao,
    comparacao:
      medicao.status === 'MEDIDA' ? compararComMeta(medicao.realCents, ciclo.poupancaAlvoCents) : null,
    alertaFaltando:
      medicao.status === 'MEDIDA'
        ? alertaLancamentosFaltando({
            rendaCents: rendaSugeridaCents,
            fixosCents: ciclo.fixosCents,
            despesasLancadasCents,
            poupancaRealCents: medicao.realCents,
          })
        : null,
    alertaGastoBaixo: alertaGastoVariavelBaixo({ gastoVariavelCents: gasto, gastosAnterioresCents }),
    rendaSugeridaCents,
  };
}

export type PreviaPoupancaReal = Pick<ResumoFechamento, 'medicao' | 'comparacao' | 'alertaFaltando'> & {
  /** Total digitado == último snapshot salvo: provável cópia sem atualizar os valores. */
  patrimonioIgualAoUltimoSnapshot: boolean;
};

/** Prévia da poupança real com o snapshot do fim digitado no wizard (sem gravá-lo). */
export async function previaPoupancaReal(
  deps: Deps,
  cicloId: string,
  snapshotDoFim: { data: string; totalCents: number },
): Promise<PreviaPoupancaReal> {
  const ciclo = await deps.ciclos.obter(cicloId);
  if (!ciclo) throw new Error('Ciclo não encontrado.');
  const [{ medicao, comparacao, alertaFaltando }, [ultimo]] = await Promise.all([
    obterResumoFechamento(deps, ciclo, snapshotDoFim),
    deps.patrimonio.ultimosSnapshots(1),
  ]);
  return {
    medicao,
    comparacao,
    alertaFaltando,
    patrimonioIgualAoUltimoSnapshot: ultimo?.totalCents === snapshotDoFim.totalCents,
  };
}

/**
 * Escolhe o ciclo a fechar: a pendência (ciclo anterior aberto) se houver,
 * senão o ciclo atual. Devolve o resumo pronto para o wizard, ou null se não
 * houver ciclo algum.
 */
export async function obterResumoParaFechar(deps: Deps): Promise<ResumoFechamento | null> {
  const { ciclo, pendenciaFechamento } = await garantirCicloAtual(deps);
  const alvo = pendenciaFechamento ?? ciclo;
  if (!alvo) return null;
  return obterResumoFechamento(deps, alvo);
}

export interface ResultadoFechamento {
  ciclo: Ciclo;
  sobraCents: number;
  taxaPoupancaEfetiva: number; // poupado / renda realizada
  variacaoPatrimonioCents: number | null;
  poupancaRealCents: number;
}

export async function fecharCiclo(
  deps: Deps,
  cicloId: string,
  input: FechamentoInput,
): Promise<ResultadoFechamento> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  const cicloAtual = await deps.ciclos.obter(cicloId);
  if (!cicloAtual) throw new Error('Ciclo não encontrado.');
  if (cicloAtual.fechado) throw new Error('Este ciclo já foi fechado.');

  const config = await deps.config.obter();
  if (!config) throw new Error('Configuração não encontrada.');

  const { sobra } = await calcularSobra(deps, cicloAtual);
  const hoje = deps.relogio.hoje();

  // Poupança real ANTES de qualquer escrita. O snapshot do input conta como o
  // do fim mesmo sem ter sido gravado; se não der para medir e não veio valor
  // manual, o ciclo fica aberto. Valor manual explícito prevalece.
  const snapshotDoInput =
    input.snapshotData && input.snapshotItens && input.snapshotItens.length > 0
      ? { data: input.snapshotData, totalCents: input.snapshotItens.reduce((s, i) => s + i.valorCents, 0) }
      : null;
  let poupanca: {
    poupancaRealCents: number;
    patrimonioInicialCents: number | null;
    patrimonioFinalCents: number | null;
    fonteMedicaoPoupanca: 'SNAPSHOT' | 'MANUAL';
  };
  if (input.poupancaRealManualCents != null) {
    poupanca = {
      poupancaRealCents: input.poupancaRealManualCents,
      patrimonioInicialCents: null,
      patrimonioFinalCents: null,
      fonteMedicaoPoupanca: 'MANUAL',
    };
  } else {
    const medicao = await medirPoupancaDoCiclo(deps, cicloAtual, snapshotDoInput);
    if (medicao.status !== 'MEDIDA') throw new PoupancaRealNaoMedidaError(medicao.motivo);
    poupanca = {
      poupancaRealCents: medicao.realCents,
      patrimonioInicialCents: medicao.inicialCents,
      patrimonioFinalCents: medicao.finalCents,
      fonteMedicaoPoupanca: 'SNAPSHOT',
    };
  }

  // 0) Resolve o destino da sobra ANTES de fechar. Se a sobra não tiver para
  //    onde ir, o ciclo permanece aberto (o usuário pode configurar a conta e
  //    tentar de novo) — nunca fica marcado como fechado com dinheiro perdido.
  const contaDestinoSobraId = await resolverDestinoSobraOuFalhar(deps, config, sobra);

  // 1) Reivindica o fechamento de forma ATÔMICA. Se outro clique/retry já
  //    fechou, aborta ANTES de creditar provisão/sobra (evita dobra — A2).
  const fechou = await deps.ciclos.fecharSePendente(cicloId, {
    fechado: true,
    fechadoEm: hoje,
    sobraCents: sobra,
    rendaRealizadaCents: input.rendaRealizadaCents,
    observacao: input.observacao ?? null,
    ...poupanca,
  });
  if (!fechou) throw new Error('Este ciclo já foi fechado.');

  const cicloFechado = (await deps.ciclos.obter(cicloId)) ?? cicloAtual;

  // 2) Credita a provisão do mês no acumulado de cada provisão ativa (decisão
  //    4). O total creditado tem que bater exatamente com o que a verba do
  //    ciclo reservou (SPEC regra 11) — por isso o rateio é feito sobre TODAS
  //    as provisões de uma vez, não provisão a provisão.
  const provisoes = await deps.provisoes.listarAtivas();
  const creditosProvisao = distribuirProvisaoMensalCents(provisoes.map((p) => p.valorAnualCents));
  for (const [indice, p] of provisoes.entries()) {
    await deps.provisoes.ajustarAcumulado(p.id, creditosProvisao[indice] ?? 0);
  }

  // 3) Destina a sobra (destino já resolvido no passo 0, antes do fechamento).
  let poupadoExtra = 0;
  if (contaDestinoSobraId) {
    await deps.contas.ajustarSaldo(contaDestinoSobraId, sobra);
    if (sobra > 0) poupadoExtra = sobra;
  }
  // ROLLOVER é lido pelo próximo garantirCicloAtual a partir de sobraCents.

  // 4) Snapshot de patrimônio (opcional).
  let variacaoPatrimonioCents: number | null = null;
  if (snapshotDoInput && input.snapshotData && input.snapshotItens) {
    const anteriorSnap = await deps.patrimonio.ultimoSnapshot();
    const novo = await criarSnapshot(deps, input.snapshotData, input.snapshotItens);
    variacaoPatrimonioCents = anteriorSnap ? novo.totalCents - anteriorSnap.totalCents : null;
  }

  // 5) Recalibração de meta (aplicada só se o usuário confirmou).
  if (input.novaMetaPoupancaCents != null) {
    await deps.config.salvar({
      ...config,
      metaPoupancaCents: input.novaMetaPoupancaCents,
      metaPoupancaPercent: null, // passa a valer o valor absoluto recalibrado
    });
  }

  // 6) Taxa de poupança efetiva.
  // D-16: poupado = o que SOBROU e foi para uma conta. A meta não entra: ela é
  // objetivo, e contá-la aqui reportaria como poupada uma reserva que nunca
  // aconteceu num ciclo em que o dono gastou a verba inteira.
  const poupado = poupadoExtra;
  const taxaPoupancaEfetiva =
    input.rendaRealizadaCents > 0 ? poupado / input.rendaRealizadaCents : 0;

  return {
    ciclo: cicloFechado,
    sobraCents: sobra,
    taxaPoupancaEfetiva,
    variacaoPatrimonioCents,
    poupancaRealCents: poupanca.poupancaRealCents,
  };
}
