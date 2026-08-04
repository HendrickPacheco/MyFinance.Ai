/**
 * Fechamento de ciclo (SPEC 7.2, regras 7, 8, 9). Destina a sobra, credita a
 * provisão do mês no acumulado (decisão 4), atualiza patrimônio e recalibra a
 * meta. O passo de recalibração é o mecanismo de progresso do app.
 */
import type { Deps } from './deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type { Ciclo, Config, Transacao } from '@/domain/model/entidades';
import { gastoRealizadoCents, distribuirProvisaoMensalCents } from '@/domain/finance';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';
import { criarSnapshot, sugestaoItensSnapshot, type ItemSnapshotInput } from './patrimonio';
import { garantirCicloAtual } from './ciclos';

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

export interface ResumoFechamento {
  ciclo: Ciclo;
  gastoRealizadoCents: number;
  sobraCents: number; // pode ser negativo (déficit)
  transacoesSemCategoria: Transacao[];
  metaSugeridaCents: number | null; // aumento sugerido (2 ciclos com folga)
  itensPatrimonioSugeridos: ItemSnapshotInput[];
}

export interface FechamentoInput {
  rendaRealizadaCents: number;
  novaMetaPoupancaCents?: number | null;
  snapshotData?: string;
  snapshotItens?: ItemSnapshotInput[];
  observacao?: string | null;
}

async function calcularSobra(deps: Deps, ciclo: Ciclo): Promise<{ gasto: number; sobra: number }> {
  const [transacoes, categorias] = await Promise.all([
    deps.transacoes.listarPorCiclo(ciclo.id),
    deps.categorias.listar(),
  ]);
  const grupos = indexarGrupoCategoria(categorias);
  const gasto = gastoRealizadoCents(paraCalculo(transacoes, grupos), ciclo.dataFim);
  return { gasto, sobra: ciclo.verbaVariavelCents - gasto };
}

/** Preview do wizard: sobra, transações sem categoria, sugestões de meta e patrimônio. */
export async function obterResumoFechamento(deps: Deps, ciclo: Ciclo): Promise<ResumoFechamento> {
  const { gasto, sobra } = await calcularSobra(deps, ciclo);
  const transacoes = await deps.transacoes.listarPorCiclo(ciclo.id);
  const transacoesSemCategoria = transacoes.filter(
    (t) => t.tipo === 'DESPESA' && !t.categoriaId,
  );

  // Meta sugerida: se este ciclo e o anterior fechado sobraram com folga (>0), sugere subir.
  const anteriores = await deps.ciclos.ultimosFechados(1);
  const anterior = anteriores[0];
  let metaSugeridaCents: number | null = null;
  if (sobra > 0 && anterior && (anterior.sobraCents ?? 0) > 0) {
    const menorSobra = Math.min(sobra, anterior.sobraCents ?? 0);
    metaSugeridaCents = ciclo.poupancaAlvoCents + menorSobra;
  }

  const itensPatrimonioSugeridos = await sugestaoItensSnapshot(deps);

  return {
    ciclo,
    gastoRealizadoCents: gasto,
    sobraCents: sobra,
    transacoesSemCategoria,
    metaSugeridaCents,
    itensPatrimonioSugeridos,
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
  if (input.snapshotData && input.snapshotItens && input.snapshotItens.length > 0) {
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
  const poupado = cicloAtual.poupancaAlvoCents + poupadoExtra;
  const taxaPoupancaEfetiva =
    input.rendaRealizadaCents > 0 ? poupado / input.rendaRealizadaCents : 0;

  return { ciclo: cicloFechado, sobraCents: sobra, taxaPoupancaEfetiva, variacaoPatrimonioCents };
}
