/**
 * Fechamento de ciclo (SPEC 7.2, regras 7, 8, 9). Destina a sobra, credita a
 * provisão do mês no acumulado (decisão 4), atualiza patrimônio e recalibra a
 * meta. O passo de recalibração é o mecanismo de progresso do app.
 */
import type { Deps } from './deps';
import type { Ciclo, Transacao } from '@/domain/model/entidades';
import { gastoRealizadoCents, provisaoMensalCents } from '@/domain/finance';
import { indexarGrupoCategoria, paraCalculo } from './mapeamento';
import { criarSnapshot, sugestaoItensSnapshot, type ItemSnapshotInput } from './patrimonio';
import { garantirCicloAtual } from './ciclos';

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
  const cicloAtual = await deps.ciclos.obter(cicloId);
  if (!cicloAtual) throw new Error('Ciclo não encontrado.');
  if (cicloAtual.fechado) throw new Error('Este ciclo já foi fechado.');

  const config = await deps.config.obter();
  if (!config) throw new Error('Configuração não encontrada.');

  const { sobra } = await calcularSobra(deps, cicloAtual);
  const hoje = deps.relogio.hoje();

  // 1) Marca o ciclo como fechado, congelando sobra e renda realizada.
  const cicloFechado = await deps.ciclos.atualizar(cicloId, {
    fechado: true,
    fechadoEm: hoje,
    sobraCents: sobra,
    rendaRealizadaCents: input.rendaRealizadaCents,
    observacao: input.observacao ?? null,
  });

  // 2) Credita a provisão do mês no acumulado de cada provisão ativa (decisão 4).
  const provisoes = await deps.provisoes.listarAtivas();
  for (const p of provisoes) {
    await deps.provisoes.ajustarAcumulado(p.id, provisaoMensalCents([p.valorAnualCents]));
  }

  // 3) Destina a sobra.
  let poupadoExtra = 0;
  if (config.destinoSobra !== 'ROLLOVER' && config.destinoSobraContaId && sobra !== 0) {
    await deps.contas.ajustarSaldo(config.destinoSobraContaId, sobra);
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
