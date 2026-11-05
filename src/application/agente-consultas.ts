/**
 * Agregações de leitura que a API do agente externo precisa (`GET /contexto`,
 * `/ciclos/comparar`, `/gastos-por-categoria`, `/tendencias`) e que nenhum
 * read-model existente cobre sozinho.
 *
 * Casca fina, como todo read-model: compõe os MESMOS read-models e funções
 * puras que a tela e o copiloto já usam — nenhum cálculo novo mora aqui
 * (CLAUDE.md regra 4). `agregarGastoPorCategoria` e `gastoRealizadoCents` são
 * os dois únicos pontos de cálculo, e os dois já existem em
 * `domain/finance/`.
 *
 * SOMENTE LEITURA de verdade (D-8): nada aqui chama `garantirCicloAtual` — uma
 * consulta do agente nunca abre ciclo como efeito colateral.
 */
import type { Deps } from './deps';
import type { Categoria, Ciclo, ProvisaoAnual } from '@/domain/model/entidades';
import type { DestinoSobra, TipoConta } from '@/domain/model/enums';
import type { DataCivil } from '@/shared/data';
import {
  agregarGastoPorCategoria,
  gastoRealizadoCents,
  parcelamentoEncerrado,
  type FatiaCategoriaAgregada,
  type TransacaoCategorizada,
} from '@/domain/finance';
import { lerCicloAtual } from './ciclos';
import { obterEstadoPainelSomenteLeitura } from './dashboard';
import type { EstadoPainel } from './dashboard-tipos';
import { obterProjecao } from './projecao';
import { listarParcelamentos, type ParcelamentoResumo } from './parcelamentos';
import { composicaoDaVerba } from './ia/ferramentas/saida';

/**
 * Forma mínima categorizada que `agregarGastoPorCategoria`/`gastoRealizadoCents`
 * consomem. Cada read-model que precisa dela monta a sua própria versão local
 * (ver `dashboard.ts: paraCalculoCategorizado`, `historico.ts`) porque
 * `mapeamento.ts: paraCalculo` não carrega `categoriaId` — só o grupo.
 */
function paraCalculoCategorizado(
  transacoes: Awaited<ReturnType<Deps['transacoes']['listarPorCiclo']>>,
  gruposPorCategoria: Map<string, Categoria['grupo']>,
): TransacaoCategorizada[] {
  return transacoes.map((t) => ({
    data: t.data,
    valorCents: t.valorCents,
    tipo: t.tipo,
    grupoCategoria: t.categoriaId ? (gruposPorCategoria.get(t.categoriaId) ?? null) : null,
    provisaoId: t.provisaoId,
    categoriaId: t.categoriaId,
  }));
}

function indexarGrupos(categorias: readonly Categoria[]): Map<string, Categoria['grupo']> {
  return new Map(categorias.map((c) => [c.id, c.grupo]));
}

function nomeaveis(categorias: readonly Categoria[]): { id: string; nome: string }[] {
  return categorias.map((c) => ({ id: c.id, nome: c.nome }));
}

// ─────────────────────────────────────────────────────────────────────────
// GET /contexto
// ─────────────────────────────────────────────────────────────────────────

export interface ContextoCicloAgente {
  id: string;
  dataInicio: DataCivil;
  dataFim: DataCivil;
  fechado: boolean;
  rendaPrevistaCents: number;
  fixosCents: number;
  provisaoMensalCents: number;
  poupancaAlvoCents: number;
  verbaVariavelCents: number;
  /** `verbaVariavel − parcelasComprometidas` (D-11) — NUNCA embutido na verba acima. */
  verbaLivreCents: number;
  parcelasComprometidasCents: number;
  rolloverRecebidoCents: number;
  gastoRealizadoCents: number;
  tetoHojeCents: number;
  restaHojeCents: number;
  diasRestantes: number;
  diasTotais: number;
  emRecuperacao: boolean;
  pendenciaFechamento: { id: string; dataInicio: DataCivil; dataFim: DataCivil } | null;
  /** Decomposição canônica da verba (D-15), com a fórmula em texto. */
  composicaoDaVerba: unknown;
}

export interface ContextoAgente {
  hoje: DataCivil;
  config: {
    rendaBaseCents: number;
    diaRecebimento: number;
    metaPoupancaCents: number | null;
    metaPoupancaPercent: number | null;
    destinoSobra: DestinoSobra;
    pisoDiarioVerbaCents: number;
  } | null;
  /** `null` quando não há ciclo aberto — ver `cicloMotivo` (D-14). */
  ciclo: ContextoCicloAgente | null;
  cicloMotivo: string | null;
  contas: { id: string; nome: string; tipo: TipoConta; saldoCents: number; arquivada: boolean }[];
  categorias: { id: string; nome: string; grupo: Categoria['grupo']; essencial: boolean }[];
  custosFixos: {
    id: string;
    nome: string;
    valorCents: number;
    diaVencimento: number;
    pago: boolean;
    vencido: boolean;
  }[];
  parcelamentosAtivos: ParcelamentoResumo[];
  provisoes: ProvisaoAnual[];
  patrimonioUltimoSnapshot: { data: DataCivil; totalCents: number } | null;
}

const SEM_CICLO_ABERTO_MOTIVO =
  'Não há ciclo aberto no momento. Abra o app para que o ciclo do período atual seja criado.';

/**
 * O primeiro endpoint que o agente chama: tudo de uma vez, numa consulta só.
 * Compõe `obterEstadoPainelSomenteLeitura` (KPIs, custos fixos com status de
 * pagamento, patrimônio resumido) com `obterProjecao` (verba livre e parcelas
 * comprometidas do ciclo 1, D-11) e `composicaoDaVerba` (D-15) — nenhum dos
 * três é recalculado aqui.
 */
export async function obterContextoAgente(deps: Deps): Promise<ContextoAgente> {
  const [config, painel, contas, categorias, parcelamentos, provisoes, ultimoSnapshot] = await Promise.all([
    deps.config.obter(),
    obterEstadoPainelSomenteLeitura(deps),
    deps.contas.listar({ incluirArquivadas: false }),
    deps.categorias.listar(),
    listarParcelamentos(deps),
    deps.provisoes.listarAtivas(),
    deps.patrimonio.ultimoSnapshot(),
  ]);

  const ciclo = painel ? await montarCicloContexto(deps, painel) : null;

  return {
    hoje: deps.relogio.hoje(),
    config: config
      ? {
          rendaBaseCents: config.rendaBaseCents,
          diaRecebimento: config.diaRecebimento,
          metaPoupancaCents: config.metaPoupancaCents,
          metaPoupancaPercent: config.metaPoupancaPercent,
          destinoSobra: config.destinoSobra,
          pisoDiarioVerbaCents: config.pisoDiarioVerbaCents,
        }
      : null,
    ciclo,
    cicloMotivo: ciclo ? null : SEM_CICLO_ABERTO_MOTIVO,
    contas: contas.map((c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      saldoCents: c.saldoCents,
      arquivada: c.arquivada,
    })),
    categorias: categorias.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, essencial: c.essencial })),
    custosFixos: painel
      ? painel.custosFixos.map((c) => ({
          id: c.custoFixoId,
          nome: c.nome,
          valorCents: c.valorCents,
          diaVencimento: c.diaVencimento,
          pago: c.pago,
          vencido: c.vencido,
        }))
      : [],
    parcelamentosAtivos: painel
      ? parcelamentos.filter(
          (p) =>
            !parcelamentoEncerrado(
              { encerradoEm: p.encerradoEm, dataUltimaParcela: p.terminaEm },
              painel.ciclo.dataInicio,
            ),
        )
      : parcelamentos.filter((p) => p.encerradoEm === null),
    provisoes,
    patrimonioUltimoSnapshot: ultimoSnapshot ? { data: ultimoSnapshot.data, totalCents: ultimoSnapshot.totalCents } : null,
  };
}

async function montarCicloContexto(deps: Deps, painel: EstadoPainel): Promise<ContextoCicloAgente> {
  const { ciclo, kpis, pendenciaFechamento } = painel;

  // Ciclo 1 da projeção = o mesmo ciclo congelado que `painel.ciclo` — é dele
  // que vêm `verbaLivreCents`/`parcelasComprometidasCents` (D-11), que
  // `EstadoPainel` não carrega.
  const { ciclos } = await obterProjecao(deps, { numCiclos: 1 });
  const projetado = ciclos[0];

  // `composicaoDaVerba` devolve `SaidaFerramenta` (`Record<string, unknown>`)
  // — espalhá-la perde a chave estática que `ContextoCicloAgente` exige, por
  // isso ela é extraída com o nome explícito em vez de via spread.
  const { composicaoDaVerba: composicao } = composicaoDaVerba({
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    fixosCents: ciclo.fixosCents,
    provisaoMensalCents: ciclo.provisaoMensalCents,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
  });

  return {
    id: ciclo.id,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    fechado: ciclo.fechado,
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    fixosCents: ciclo.fixosCents,
    provisaoMensalCents: ciclo.provisaoMensalCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    verbaVariavelCents: ciclo.verbaVariavelCents,
    verbaLivreCents: projetado?.verbaLivreCents ?? ciclo.verbaVariavelCents,
    parcelasComprometidasCents: projetado?.parcelasComprometidasCents ?? 0,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
    gastoRealizadoCents: kpis.gastoRealizadoCents,
    tetoHojeCents: kpis.tetoHojeCents,
    restaHojeCents: kpis.restaHojeCents,
    diasRestantes: kpis.diasRestantes,
    diasTotais: kpis.diasTotais,
    emRecuperacao: kpis.emRecuperacao,
    pendenciaFechamento: pendenciaFechamento
      ? {
          id: pendenciaFechamento.id,
          dataInicio: pendenciaFechamento.dataInicio,
          dataFim: pendenciaFechamento.dataFim,
        }
      : null,
    composicaoDaVerba: composicao,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// GET /ciclos/comparar
// ─────────────────────────────────────────────────────────────────────────

export interface LinhaComparacaoCiclo {
  cicloId: string;
  dataInicio: DataCivil;
  dataFim: DataCivil;
  fechado: boolean;
  rendaPrevistaCents: number;
  rendaRealizadaCents: number | null;
  fixosCents: number;
  provisaoMensalCents: number;
  poupancaAlvoCents: number;
  verbaVariavelCents: number;
  rolloverRecebidoCents: number;
  sobraCents: number | null;
  gastoRealizadoCents: number;
  porCategoria: FatiaCategoriaAgregada[];
}

export interface ResultadoComparacaoCiclos {
  ciclos: LinhaComparacaoCiclo[];
}

/** Default e teto de segurança quando o chamador pede `ultimos` sem `ids`. */
const COMPARACAO_PADRAO = 2;
const COMPARACAO_TETO = 12;

/**
 * Compara ciclos específicos (`ids`, na ordem dada) ou os últimos N fechados.
 * `ids` que não resolvem a um ciclo do dono são descartados em silêncio — o
 * mesmo contrato de `obterEstadoCicloPorId` (devolve o que existe, não lança
 * por um id estranho isolado).
 */
export async function compararCiclos(
  deps: Deps,
  opcoes: { ids?: readonly string[]; ultimos?: number },
): Promise<ResultadoComparacaoCiclos> {
  const ciclos =
    opcoes.ids && opcoes.ids.length > 0
      ? await buscarCiclosPorId(deps, opcoes.ids)
      : await deps.ciclos.ultimosFechados(Math.min(opcoes.ultimos ?? COMPARACAO_PADRAO, COMPARACAO_TETO));

  if (ciclos.length === 0) return { ciclos: [] };

  const categorias = await deps.categorias.listar();
  const grupos = indexarGrupos(categorias);
  const nomes = nomeaveis(categorias);

  const linhas = await Promise.all(ciclos.map((ciclo) => montarLinhaComparacao(deps, ciclo, grupos, nomes)));

  return { ciclos: linhas };
}

async function buscarCiclosPorId(deps: Deps, ids: readonly string[]): Promise<Ciclo[]> {
  const encontrados = await Promise.all(ids.map((id) => deps.ciclos.obter(id)));
  return encontrados.filter((c): c is Ciclo => c !== null);
}

/** Gasto realizado e decomposição por categoria de UM ciclo — o núcleo compartilhado por `compararCiclos` e `obterDetalheCicloAgente`. */
async function totaisPorCategoriaDoCiclo(
  deps: Deps,
  ciclo: Ciclo,
  grupos: Map<string, Categoria['grupo']>,
  nomes: { id: string; nome: string }[],
): Promise<{ gastoRealizadoCents: number; porCategoria: FatiaCategoriaAgregada[] }> {
  const transacoes = await deps.transacoes.listarPorCiclo(ciclo.id);
  const calc = paraCalculoCategorizado(transacoes, grupos);

  return {
    gastoRealizadoCents: gastoRealizadoCents(calc, ciclo.dataFim),
    porCategoria: agregarGastoPorCategoria(calc, nomes, ciclo.dataFim),
  };
}

async function montarLinhaComparacao(
  deps: Deps,
  ciclo: Ciclo,
  grupos: Map<string, Categoria['grupo']>,
  nomes: { id: string; nome: string }[],
): Promise<LinhaComparacaoCiclo> {
  const totais = await totaisPorCategoriaDoCiclo(deps, ciclo, grupos, nomes);

  return {
    cicloId: ciclo.id,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    fechado: ciclo.fechado,
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    rendaRealizadaCents: ciclo.rendaRealizadaCents,
    fixosCents: ciclo.fixosCents,
    provisaoMensalCents: ciclo.provisaoMensalCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    verbaVariavelCents: ciclo.verbaVariavelCents,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
    sobraCents: ciclo.sobraCents,
    ...totais,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// GET /ciclos e GET /ciclos/:id
// ─────────────────────────────────────────────────────────────────────────

export interface ResumoCicloAgente {
  id: string;
  dataInicio: DataCivil;
  dataFim: DataCivil;
  fechado: boolean;
  rendaPrevistaCents: number;
  rendaRealizadaCents: number | null;
  fixosCents: number;
  provisaoMensalCents: number;
  poupancaAlvoCents: number;
  verbaVariavelCents: number;
  rolloverRecebidoCents: number;
  sobraCents: number | null;
}

function resumirCiclo(ciclo: Ciclo): ResumoCicloAgente {
  return {
    id: ciclo.id,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    fechado: ciclo.fechado,
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    rendaRealizadaCents: ciclo.rendaRealizadaCents,
    fixosCents: ciclo.fixosCents,
    provisaoMensalCents: ciclo.provisaoMensalCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    verbaVariavelCents: ciclo.verbaVariavelCents,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
    sobraCents: ciclo.sobraCents,
  };
}

/**
 * Lista o ciclo em curso (se houver) seguido dos últimos `limite` fechados,
 * sem duplicar o atual caso ele apareça nos dois lados. Somente leitura
 * (D-8): usa `lerCicloAtual`, nunca cria o ciclo de hoje como efeito
 * colateral de uma listagem.
 *
 * Teto do port (`CicloRepository.ultimosFechados`): não há cursor de
 * verdade por baixo — `limite` é o tamanho da janela mais recente, não uma
 * página arbitrária. Paginação por cursor real exigiria um método novo no
 * repositório (fora da posse deste grupo).
 */
export async function listarCiclosAgente(
  deps: Deps,
  opcoes: { limite: number },
): Promise<{ ciclos: ResumoCicloAgente[] }> {
  const [resolvido, fechados] = await Promise.all([
    lerCicloAtual(deps),
    deps.ciclos.ultimosFechados(opcoes.limite),
  ]);

  const semDuplicarAtual = resolvido ? fechados.filter((c) => c.id !== resolvido.ciclo.id) : fechados;
  const ciclos = resolvido ? [resolvido.ciclo, ...semDuplicarAtual] : semDuplicarAtual;

  return { ciclos: ciclos.map(resumirCiclo) };
}

export interface DetalheCicloAgente extends ResumoCicloAgente {
  gastoRealizadoCents: number;
  porCategoria: FatiaCategoriaAgregada[];
}

/** `null` quando `cicloId` não resolve a um ciclo do dono — a rota decide se isso é 404. */
export async function obterDetalheCicloAgente(deps: Deps, cicloId: string): Promise<DetalheCicloAgente | null> {
  const ciclo = await deps.ciclos.obter(cicloId);
  if (!ciclo) return null;

  const categorias = await deps.categorias.listar();
  const totais = await totaisPorCategoriaDoCiclo(deps, ciclo, indexarGrupos(categorias), nomeaveis(categorias));

  return { ...resumirCiclo(ciclo), ...totais };
}

// ─────────────────────────────────────────────────────────────────────────
// GET /gastos-por-categoria
// ─────────────────────────────────────────────────────────────────────────

export type OpcoesGastosPorCategoria = { cicloId: string } | { de: DataCivil; ate: DataCivil };

export interface ResultadoGastosPorCategoria {
  periodo:
    | { cicloId: string; dataInicio: DataCivil; dataFim: DataCivil }
    | { de: DataCivil; ate: DataCivil };
  categorias: FatiaCategoriaAgregada[];
}

/**
 * Gasto de verba variável por categoria, num ciclo específico ou num
 * intervalo livre de datas. `null` quando `cicloId` não resolve a um ciclo do
 * dono — quem chama decide se isso é 404.
 */
export async function obterGastosPorCategoria(
  deps: Deps,
  opcoes: OpcoesGastosPorCategoria,
): Promise<ResultadoGastosPorCategoria | null> {
  const categorias = await deps.categorias.listar();
  const grupos = indexarGrupos(categorias);
  const nomes = nomeaveis(categorias);

  if ('cicloId' in opcoes) {
    const ciclo = await deps.ciclos.obter(opcoes.cicloId);
    if (!ciclo) return null;

    const transacoes = await deps.transacoes.listarPorCiclo(ciclo.id);
    const calc = paraCalculoCategorizado(transacoes, grupos);
    return {
      periodo: { cicloId: ciclo.id, dataInicio: ciclo.dataInicio, dataFim: ciclo.dataFim },
      categorias: agregarGastoPorCategoria(calc, nomes, ciclo.dataFim),
    };
  }

  const transacoes = await deps.transacoes.listarPorIntervalo(opcoes.de, opcoes.ate);
  const calc = paraCalculoCategorizado(transacoes, grupos);
  return {
    periodo: { de: opcoes.de, ate: opcoes.ate },
    // `ateData = opcoes.ate`: o próprio intervalo já é o corte inferior (o
    // repositório só devolveu transações com `data >= de`), e
    // `agregarGastoPorCategoria` aplica o corte superior.
    categorias: agregarGastoPorCategoria(calc, nomes, opcoes.ate),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// GET /tendencias
// ─────────────────────────────────────────────────────────────────────────

export interface PontoTendenciaCategoria {
  cicloId: string;
  dataInicio: DataCivil;
  dataFim: DataCivil;
  totalCents: number;
}

export interface ResultadoTendenciaCategoria {
  categoriaId: string;
  categoriaNome: string | null;
  pontos: PontoTendenciaCategoria[];
}

const TENDENCIA_PADRAO = 6;
const TENDENCIA_TETO = 24;

/**
 * Série do gasto de uma categoria pelos últimos N ciclos FECHADOS, do mais
 * antigo para o mais novo (leitura natural de uma série temporal).
 */
export async function obterTendenciaCategoria(
  deps: Deps,
  opcoes: { categoriaId: string; ultimos?: number },
): Promise<ResultadoTendenciaCategoria> {
  const quantidade = Math.min(opcoes.ultimos ?? TENDENCIA_PADRAO, TENDENCIA_TETO);
  const [fechados, categorias] = await Promise.all([
    deps.ciclos.ultimosFechados(quantidade),
    deps.categorias.listar(),
  ]);

  const grupos = indexarGrupos(categorias);
  const nomes = nomeaveis(categorias);
  const categoriaNome = categorias.find((c) => c.id === opcoes.categoriaId)?.nome ?? null;

  const cronologicos = [...fechados].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));

  const pontos = await Promise.all(
    cronologicos.map(async (ciclo) => {
      const transacoes = await deps.transacoes.listarPorCiclo(ciclo.id);
      const calc = paraCalculoCategorizado(transacoes, grupos);
      const fatias = agregarGastoPorCategoria(calc, nomes, ciclo.dataFim);
      const fatia = fatias.find((f) => f.categoriaId === opcoes.categoriaId);
      return {
        cicloId: ciclo.id,
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
        totalCents: fatia?.totalCents ?? 0,
      };
    }),
  );

  return { categoriaId: opcoes.categoriaId, categoriaNome, pontos };
}
