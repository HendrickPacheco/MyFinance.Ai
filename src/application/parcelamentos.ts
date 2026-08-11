/**
 * Casos de uso de compra parcelada (TASKS-CUSTOS Fase 5 — a mais arriscada do
 * plano). `criarParcelamento` já vive em `transacoes.ts`; este módulo cobre o
 * ciclo de vida depois da criação: listar com números agregados, cancelar as
 * parcelas futuras (encerramento antecipado) e editar o cadastro.
 *
 * Duas regras que este arquivo não pode violar:
 *
 * - **R1 — passado é congelado.** Parcela paga (`pagoEm != null`) e parcela em
 *   ciclo fechado são história: nunca são apagadas nem reescritas.
 * - **R2 — retroatividade passa pela guarda.** Toda operação que apaga ou
 *   edita `Transacao` reusa `exigirConfirmacaoSeRetroativo` +
 *   `recalcularSobraDosCiclosFechados` de `retroatividade.ts` — o mesmo
 *   caminho de `excluirTransacao`/`editarTransacao`. Fazer isso por fora
 *   corrompe `Ciclo.sobraCents` sem lançar erro nenhum.
 */
import type { Deps } from './deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type { DataCivil } from '@/shared/data';
import type { MetodoPagamento } from '@/domain/model/enums';
import type { Parcelamento, Transacao } from '@/domain/model/entidades';
import { gerarParcelas, limitesCiclo, proximoCicloApos } from '@/domain/finance';
import { resolverCicloId, somarEfeitos } from './transacoes';
import {
  ciclosFechadosEntre,
  criarCacheCiclos,
  exigirConfirmacaoSeRetroativo,
  recalcularSobraDosCiclosFechados,
  type CacheCiclos,
} from './retroatividade';
import { validarCategoriaVariavel } from './categoria-parcela';

// A guarda de categoria mudou de casa (para `criarParcelamento` poder usá-la
// sem fechar um ciclo de imports); reexportada para não quebrar quem já
// importa a classe daqui.
export { CategoriaInvalidaParaParcelaError } from './categoria-parcela';

/**
 * Uma parcela como a tela precisa dela: identidade para o `PagamentoToggle`,
 * competência, valor e estado. É a `Transacao` real — nunca uma parcela
 * recalculada do cadastro.
 */
export interface ParcelaResumo {
  transacaoId: string;
  parcelaNum: number | null;
  data: DataCivil;
  valorCents: number;
  pago: boolean;
  /** Congelada: nem o encerramento nem a edição financeira a alcançam. */
  emCicloFechado: boolean;
}

/** Resumo de um parcelamento com números agregados a partir das parcelas reais. */
export interface ParcelamentoResumo extends Parcelamento {
  /**
   * Competência da última parcela EXISTENTE, derivada das `Transacao` reais
   * — nunca recalculada como `addMeses(dataCompra, numParcelas - 1)`, porque
   * um encerramento antecipado apaga parcelas futuras e a fonte de verdade
   * passa a ser o que sobrou. `null` só quando não há nenhuma parcela.
   *
   * Calculada por `max(data)`, e não por `parcelas.at(-1)`: a ordem de
   * `listarPorParcelamento` é contrato do port, mas depender dela aqui
   * transformaria uma troca de adapter num erro de dinheiro silencioso
   * (§5.1 ticket 5).
   */
  terminaEm: DataCivil | null;
  parcelasPagas: number;
  parcelasTotal: number;
  /** Soma das parcelas ainda não pagas (`pagoEm == null`). */
  valorRestanteCents: number;
  /** Quantas parcelas caem num ciclo já fechado. */
  parcelasEmCicloFechado: number;
  /**
   * O que esta compra consome do teto POR MÊS — a coluna mais importante da
   * tela (§3.2). Vem da parcela corrente real, não de `valorTotal/numParcelas`:
   * a divisão usa `floor` com o resto na última parcela, então a média mentiria
   * em alguns centavos e a última parcela mentiria em todas as outras.
   * `0` quando não há nenhuma parcela.
   */
  valorMensalCents: number;
  /**
   * O `k` de "k/N": `parcelaNum` da parcela corrente (a última cuja competência
   * já caiu dentro do ciclo atual; a primeira, quando a compra é toda futura).
   * `null` quando não há parcela.
   */
  parcelaCorrente: number | null;
  /**
   * "⬆ acaba no próximo mês" — a verba livre respira no ciclo seguinte. Vem do
   * SERVIDOR porque só ele conhece a grade de ciclos (que não é o mês civil).
   */
  acabaNoProximoCiclo: boolean;
  /**
   * Método de pagamento em vigor. Vive na `Transacao`, não no cadastro, então
   * é lido da primeira parcela — é o mesmo valor que `regenerarParcelas`
   * preserva. `null` sem parcelas.
   */
  metodoAtual: MetodoPagamento | null;
  /** O cronograma, para a linha expansível. Já é o que foi lido para agregar. */
  parcelas: readonly ParcelaResumo[];
}

/** Um grupo de parcelas contadas, somadas e datadas — o vocabulário do §4.2. */
export interface GrupoDeParcelas {
  quantidade: number;
  valorCents: number;
  /** Competência da primeira e da última do grupo; `null` no grupo vazio. */
  primeiraEm: DataCivil | null;
  ultimaEm: DataCivil | null;
}

/**
 * Os números que o diálogo de encerramento precisa ANTES de agir (§4.2).
 *
 * Existe porque `ResultadoEncerramentoParcelamento` só conta o que já
 * aconteceu, e o §4.2 exige que a consequência seja lida em números antes de
 * o dono escolher. Read-only: não escreve nada e não exige `confirmarRetroativo`.
 */
export interface PreviaEncerramento {
  parcelamentoId: string;
  descricao: string;
  valorTotalCents: number;
  dataCompra: DataCivil;
  numParcelas: number;
  /** Já encerrado: o diálogo não deve prometer cancelar nada. */
  jaEncerrado: boolean;
  pagas: GrupoDeParcelas;
  /** O que o botão vai apagar — exatamente o conjunto de `encerrarParcelamento`. */
  aCancelar: GrupoDeParcelas;
  /**
   * Nem paga nem cancelável: parcela vencida sem `pagoEm` marcado, ou parcela
   * em ciclo fechado. Preservada, e o diálogo precisa dizer isso — senão o
   * dono conta 12 = 7 + 5 e não fecha.
   */
  preservadas: GrupoDeParcelas;
  /**
   * Quanto a verba livre sobe por mês depois do cancelamento, e a partir de
   * qual competência. `null` quando não há nada a cancelar.
   */
  alivioMensalCents: number | null;
  alivioAPartirDe: DataCivil | null;
}

/** Contagem do que `encerrarParcelamento` fez, para a UI dizer "N futuras canceladas, M pagas preservadas". */
export interface ResultadoEncerramentoParcelamento {
  parcelasCanceladas: number;
  parcelasPreservadas: number;
}

/**
 * Lançado ao tentar editar `valorTotalCents`, `numParcelas` ou `dataCompra`
 * de um parcelamento que já tem parcela paga ou parcela em ciclo fechado.
 * Manter `soma(parcelas) === valorTotalCents` exigiria reescrever parcelas
 * que são história — fora de escopo (TASKS-CUSTOS §2.3). A saída é encerrar
 * as futuras e criar outra compra.
 */
export class ParcelamentoImutavelError extends Error {
  constructor(
    public readonly parcelasPagas: number,
    public readonly parcelasEmCicloFechado: number,
  ) {
    super(
      parcelasPagas > 0
        ? `Já há ${parcelasPagas} parcela(s) paga(s); encerre as futuras e crie outra compra.`
        : `Há ${parcelasEmCicloFechado} parcela(s) em ciclo fechado; encerre as futuras e crie outra compra.`,
    );
    this.name = 'ParcelamentoImutavelError';
  }
}

/**
 * Lançado ao tentar editar `valorTotalCents`, `numParcelas` ou `dataCompra`
 * de um parcelamento já encerrado (`encerradoEm != null`). As parcelas
 * futuras foram apagadas no encerramento — regenerá-las ressuscitaria uma
 * dívida que o dono já deu por cancelada, com `encerradoEm` continuando
 * carimbado (sumiria da lista "em andamento" e voltaria a consumir o teto).
 * Edição de `descricao`/`categoriaId` continua permitida: é cadastro
 * histórico, não mexe em dinheiro nem ressuscita parcela nenhuma.
 */
export class ParcelamentoEncerradoError extends Error {
  constructor(public readonly encerradoEm: DataCivil) {
    super(`Parcelamento encerrado em ${encerradoEm}; crie outra compra para o valor restante.`);
    this.name = 'ParcelamentoEncerradoError';
  }
}

export interface PatchParcelamento {
  descricao?: string;
  categoriaId?: string | null;
  /**
   * Método de pagamento das parcelas. Vive na `Transacao`, não no cadastro,
   * então editá-lo se propaga para todas as parcelas — inclusive as de ciclo
   * fechado, e SEM guarda de retroatividade de propósito: `metodo` não entra
   * em nenhuma conta de dinheiro (`sobraCiclo` → `gastoRealizadoCents` →
   * `contaComoVerbaVariavel` filtra por GRUPO da categoria, nunca por método).
   * Ele só alimenta a quebra por método de `/analise`, que é leitura derivada
   * — daí a action revalidar `/analise`.
   */
  metodo?: MetodoPagamento | null;
  /** Só aceito quando não há parcela paga nem em ciclo fechado (ver `ParcelamentoImutavelError`). */
  valorTotalCents?: number;
  numParcelas?: number;
  dataCompra?: DataCivil;
}

/** Ids de ciclo fechado dentre as parcelas de um parcelamento (deduplicados). */
async function cicloIdsFechadosDas(
  deps: Deps,
  parcelas: readonly Transacao[],
  cache?: CacheCiclos,
): Promise<Set<string>> {
  const fechados = await ciclosFechadosEntre(
    deps,
    parcelas.map((t) => t.cicloId),
    cache,
  );
  return new Set(fechados.map((c) => c.id));
}

/**
 * Grade de ciclos usada só para APRESENTAR (parcela corrente, "acaba no
 * próximo"). O ciclo atual vem do repositório quando já nasceu — é o mesmo
 * ciclo congelado que o resto do app usa — e cai para `limitesCiclo` quando
 * ainda não nasceu. O ciclo seguinte sai de `proximoCicloApos`, que trata a
 * transição de `diaRecebimento` sem sobrepor o ciclo anterior.
 */
interface JanelaDeCiclos {
  fimCicloAtual: DataCivil;
  fimProximoCiclo: DataCivil;
}

async function janelaDeCiclos(deps: Deps): Promise<JanelaDeCiclos | null> {
  const config = await deps.config.obter();
  if (!config) return null;

  const hoje = deps.relogio.hoje();
  const atual = await deps.ciclos.obterAtual(hoje);
  const fimCicloAtual = atual?.dataFim ?? limitesCiclo(hoje, config.diaRecebimento).fim;
  return {
    fimCicloAtual,
    fimProximoCiclo: proximoCicloApos(fimCicloAtual, config.diaRecebimento).fim,
  };
}

/** Resumo com números agregados a partir das `Transacao` reais — nunca do cadastro isolado. */
async function resumirParcelamento(
  deps: Deps,
  parcelamento: Parcelamento,
  janela: JanelaDeCiclos | null,
  cache: CacheCiclos,
): Promise<ParcelamentoResumo> {
  const parcelas = await deps.transacoes.listarPorParcelamento(parcelamento.id);
  const cicloIdsFechados = await cicloIdsFechadosDas(deps, parcelas, cache);

  // `max`/`min` sobre os dados, e não `at(-1)`/`[0]`: ver o docblock de
  // `terminaEm` (§5.1 ticket 5).
  const terminaEm = parcelas.reduce<DataCivil | null>(
    (maior, t) => (maior == null || t.data > maior ? t.data : maior),
    null,
  );

  // Parcela corrente: a última que já caiu dentro do ciclo atual. Sem janela
  // (Config ausente) ou com a compra inteira no futuro, é a primeira — nunca
  // `null` com parcelas existindo, porque a tela mostraria "—/12".
  const emOrdem = [...parcelas].sort(
    (a, b) => a.data.localeCompare(b.data) || (a.parcelaNum ?? 0) - (b.parcelaNum ?? 0),
  );
  const jaVencidas = janela ? emOrdem.filter((t) => t.data <= janela.fimCicloAtual) : [];
  const corrente = jaVencidas.at(-1) ?? emOrdem[0] ?? null;

  return {
    ...parcelamento,
    terminaEm,
    parcelasPagas: parcelas.filter((t) => t.pagoEm != null).length,
    parcelasTotal: parcelas.length,
    valorRestanteCents: parcelas
      .filter((t) => t.pagoEm == null)
      .reduce((soma, t) => soma + t.valorCents, 0),
    parcelasEmCicloFechado: parcelas.filter(
      (t) => t.cicloId != null && cicloIdsFechados.has(t.cicloId),
    ).length,
    valorMensalCents: corrente?.valorCents ?? 0,
    parcelaCorrente: corrente?.parcelaNum ?? null,
    acabaNoProximoCiclo:
      janela != null &&
      terminaEm != null &&
      terminaEm > janela.fimCicloAtual &&
      terminaEm <= janela.fimProximoCiclo,
    metodoAtual: emOrdem[0]?.metodo ?? null,
    parcelas: emOrdem.map((t) => ({
      transacaoId: t.id,
      parcelaNum: t.parcelaNum,
      data: t.data,
      valorCents: t.valorCents,
      pago: t.pagoEm != null,
      emCicloFechado: t.cicloId != null && cicloIdsFechados.has(t.cicloId),
    })),
  };
}

/**
 * Todos os parcelamentos do dono (em andamento e encerrados), com números
 * agregados prontos para a UI ordenar por "termina primeiro" e alimentar o
 * diálogo de encerramento sem recalcular nada no cliente.
 *
 * As compras são resumidas em PARALELO e compartilham um cache de ciclos
 * (§5.1 ticket 3): antes eram ~13 consultas de transação e até ~150 de ciclo,
 * todas em série, para resolver meia-dúzia de ciclos distintos.
 */
export async function listarParcelamentos(deps: Deps): Promise<ParcelamentoResumo[]> {
  const [parcelamentos, janela] = await Promise.all([
    deps.parcelamentos.listar(),
    janelaDeCiclos(deps),
  ]);
  const cache = criarCacheCiclos(deps);
  return Promise.all(parcelamentos.map((p) => resumirParcelamento(deps, p, janela, cache)));
}

/** Um grupo vazio — evita `null` espalhado nos três campos da prévia. */
const GRUPO_VAZIO: GrupoDeParcelas = {
  quantidade: 0,
  valorCents: 0,
  primeiraEm: null,
  ultimaEm: null,
};

function agrupar(parcelas: readonly Transacao[]): GrupoDeParcelas {
  if (parcelas.length === 0) return GRUPO_VAZIO;
  const datas = parcelas.map((t) => t.data).sort();
  return {
    quantidade: parcelas.length,
    valorCents: parcelas.reduce((soma, t) => soma + t.valorCents, 0),
    primeiraEm: datas[0] ?? null,
    ultimaEm: datas.at(-1) ?? null,
  };
}

/**
 * A PARTIÇÃO das parcelas em pagas / canceláveis / preservadas.
 *
 * Ponto único de verdade do critério, chamado tanto pela prévia (leitura)
 * quanto pelo encerramento (escrita). Separá-los seria a receita para um
 * diálogo que promete cancelar 5 e uma ação que cancela 4 — o defeito que o
 * §4.2 existe para impedir.
 *
 * Cancelável exige as TRÊS condições ao mesmo tempo: `pagoEm == null`, fora de
 * ciclo fechado e ESTRITAMENTE futura (`data > hoje`). "Futura" e "não paga"
 * não são o mesmo conjunto: `pagoEm` é marcação manual do `PagamentoToggle` e
 * o dono raramente marca, então parcela vencida e não marcada provavelmente já
 * caiu no cartão — apagá-la faria gasto histórico desaparecer.
 */
function particionarParcelas(
  parcelas: readonly Transacao[],
  hoje: DataCivil,
  cicloIdsFechados: ReadonlySet<string>,
): { pagas: Transacao[]; aCancelar: Transacao[]; preservadasNaoPagas: Transacao[] } {
  const pagas: Transacao[] = [];
  const aCancelar: Transacao[] = [];
  const preservadasNaoPagas: Transacao[] = [];

  for (const t of parcelas) {
    if (t.pagoEm != null) {
      pagas.push(t);
      continue;
    }
    const emCicloFechado = t.cicloId != null && cicloIdsFechados.has(t.cicloId);
    if (!emCicloFechado && t.data > hoje) aCancelar.push(t);
    else preservadasNaoPagas.push(t);
  }

  return { pagas, aCancelar, preservadasNaoPagas };
}

/**
 * Prévia do encerramento (§4.2): os números ANTES das opções, do servidor,
 * nunca estimados no cliente. Não escreve nada.
 */
export async function previaEncerramentoParcelamento(
  deps: Deps,
  id: string,
): Promise<PreviaEncerramento> {
  const parcelamento = await deps.parcelamentos.obter(id);
  if (!parcelamento) throw new Error('Parcelamento não encontrado.');

  const parcelas = await deps.transacoes.listarPorParcelamento(id);
  const cicloIdsFechados = await cicloIdsFechadosDas(deps, parcelas);
  // Parcelamento já encerrado não cancela mais nada — a mesma saída de
  // `encerrarParcelamento`, para prévia e ação nunca discordarem.
  const { pagas, aCancelar, preservadasNaoPagas } = parcelamento.encerradoEm
    ? { pagas: parcelas.filter((t) => t.pagoEm != null), aCancelar: [], preservadasNaoPagas: parcelas.filter((t) => t.pagoEm == null) }
    : particionarParcelas(parcelas, deps.relogio.hoje(), cicloIdsFechados);

  const canceladasEmOrdem = [...aCancelar].sort((a, b) => a.data.localeCompare(b.data));
  const primeiraCancelada = canceladasEmOrdem[0] ?? null;

  return {
    parcelamentoId: parcelamento.id,
    descricao: parcelamento.descricao,
    valorTotalCents: parcelamento.valorTotalCents,
    dataCompra: parcelamento.dataCompra,
    numParcelas: parcelamento.numParcelas,
    jaEncerrado: parcelamento.encerradoEm != null,
    pagas: agrupar(pagas),
    aCancelar: agrupar(aCancelar),
    preservadas: agrupar(preservadasNaoPagas),
    // O alívio é o valor da PRIMEIRA parcela cancelada, e não a média: é ela
    // que deixa de consumir o teto no mês em que o alívio começa.
    alivioMensalCents: primeiraCancelada?.valorCents ?? null,
    alivioAPartirDe: primeiraCancelada?.data ?? null,
  };
}

/**
 * Cancelamento antecipado (TASKS-CUSTOS §0.4 / §4.2): apaga as parcelas que
 * são *simultaneamente* não pagas, fora de ciclo fechado e ESTRITAMENTE
 * futuras (`data > hoje`) — revertendo o efeito de saldo e de provisão de
 * cada uma, no mesmo caminho de `excluirTransacao`. "Futura" e "não paga" não
 * são o mesmo conjunto: `pagoEm` é preenchido manualmente pelo
 * `PagamentoToggle` e o dono raramente marca, então uma parcela vencida e não
 * paga provavelmente já caiu no cartão — apagá-la faria gasto histórico
 * desaparecer. Toda parcela paga, toda parcela de ciclo fechado e toda
 * parcela vencida-mas-não-marcada é preservada, sem exceção (R1). Idempotente:
 * chamar de novo num parcelamento já encerrado não apaga nada e devolve as
 * parcelas restantes como preservadas — mesma escolha de idempotência de
 * `PagamentoFixoRepository` (marcar duas vezes nunca duplica nem lança erro),
 * para um duplo-clique no botão de encerrar não quebrar a tela com um erro
 * evitável.
 */
export async function encerrarParcelamento(
  deps: Deps,
  id: string,
  confirmarRetroativo = false,
): Promise<ResultadoEncerramentoParcelamento> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  const parcelamento = await deps.parcelamentos.obter(id);
  if (!parcelamento) throw new Error('Parcelamento não encontrado.');

  const parcelas = await deps.transacoes.listarPorParcelamento(id);

  if (parcelamento.encerradoEm) {
    return { parcelasCanceladas: 0, parcelasPreservadas: parcelas.length };
  }

  const hoje = deps.relogio.hoje();
  const cicloIdsFechados = await cicloIdsFechadosDas(deps, parcelas);
  // Critério das TRÊS condições — ver `particionarParcelas`, que é o mesmo
  // ponto de verdade consultado pela prévia do diálogo.
  const { aCancelar: aApagar } = particionarParcelas(parcelas, hoje, cicloIdsFechados);

  // Checagem defensiva (R2): pela regra acima nenhuma parcela em `aApagar`
  // deveria pertencer a um ciclo fechado — o filtro já as exclui. Existe para
  // o caso de o vínculo `cicloId` estar inconsistente (ex.: fechamento
  // concorrente entre a leitura acima e esta chamada).
  const ciclosFechados = await exigirConfirmacaoSeRetroativo(
    deps,
    aApagar.map((t) => t.cicloId),
    confirmarRetroativo,
  );

  // TUDO OU NADA (§5.1 ticket 1). Antes eram três round-trips POR PARCELA —
  // `ajustarSaldo(-1)`, `ajustarAcumulado(-1)`, `excluir` — e uma falha no
  // meio deixava saldo creditado de parcela que continuava viva; o retry
  // creditava de novo. Agora os deltas são somados antes e a exclusão viaja
  // junto deles num único `$transaction`.
  const efeitos = somarEfeitos(aApagar.map((transacao) => ({ transacao, sinal: -1 as const })));
  await deps.transacoes.aplicarLote({
    excluir: aApagar.map((t) => t.id),
    ajustesConta: efeitos.ajustesConta,
    ajustesProvisao: efeitos.ajustesProvisao,
  });

  // Só carimba `encerradoEm` quando algo foi de fato cancelado. Um
  // parcelamento inteiro dentro de ciclo fechado (ou todo pago) tem
  // `aApagar` vazio — carimbar aqui esconderia da lista "em andamento" uma
  // compra cujas parcelas continuam vivas e consumindo o teto (achado
  // MÉDIO #3 da auditoria).
  if (aApagar.length > 0) {
    await deps.parcelamentos.atualizar(id, { encerradoEm: hoje });
  }
  await recalcularSobraDosCiclosFechados(deps, ciclosFechados);

  return {
    parcelasCanceladas: aApagar.length,
    parcelasPreservadas: parcelas.length - aApagar.length,
  };
}

/**
 * Apaga todas as parcelas atuais (revertendo seus efeitos) e gera um novo
 * conjunto com `gerarParcelas` — a mesma função pura que `criarParcelamento`
 * usa — garantindo `soma(parcelas) === valorTotalCents` mesmo quando a
 * divisão não é exata (o resto vai para a última parcela). Só é chamada
 * quando o chamador já validou que não há parcela paga nem em ciclo fechado
 * entre as atuais; ainda assim, a checagem de retroatividade cobre também o
 * DESTINO das novas parcelas — uma `dataCompra` retroativa pode reencaixar a
 * primeira parcela dentro de um ciclo já fechado.
 */
async function regenerarParcelas(
  deps: Deps,
  atual: Parcelamento,
  patch: PatchParcelamento,
  parcelasAtuais: readonly Transacao[],
  confirmarRetroativo: boolean,
): Promise<void> {
  const valorTotalCents = patch.valorTotalCents ?? atual.valorTotalCents;
  const numParcelas = patch.numParcelas ?? atual.numParcelas;
  const dataCompra = patch.dataCompra ?? atual.dataCompra;
  const descricao = patch.descricao ?? atual.descricao;
  const categoriaId = patch.categoriaId !== undefined ? patch.categoriaId : atual.categoriaId;
  const categoriaMudou = patch.categoriaId !== undefined && patch.categoriaId !== atual.categoriaId;

  if (categoriaMudou) {
    await validarCategoriaVariavel(deps, categoriaId);
  }

  const geradas = gerarParcelas({ valorTotalCents, numParcelas, dataCompra });
  const cicloIdsDestino = await Promise.all(geradas.map((p) => resolverCicloId(deps, p.data)));

  const ciclosFechados = await exigirConfirmacaoSeRetroativo(
    deps,
    [...parcelasAtuais.map((t) => t.cicloId), ...cicloIdsDestino],
    confirmarRetroativo,
  );

  // Método de pagamento não é campo do `Parcelamento` (só de `Transacao`) —
  // preserva o que as parcelas atuais já tinham, igual `criarParcelamento`
  // faria se recebesse o mesmo input de novo. Lista vazia (parcelamento sem
  // nenhuma parcela viva) cai no mesmo default que `criarParcelamento` usa.
  const metodoAnterior =
    patch.metodo !== undefined ? patch.metodo : (parcelasAtuais[0]?.metodo ?? 'CREDITO');
  // `contaId`/`provisaoId` são da PARCELA, não do cadastro, então o patch não
  // os traz — mas descartá-los na regeneração desfazia o vínculo em silêncio
  // (§5.1 ticket 2): a parcela deixava de abater a conta que abatia, e uma
  // parcela de provisão voltava a consumir verba. Preserva-se o vínculo da
  // primeira parcela, do mesmo jeito que `metodo` já era preservado.
  const contaAnterior = parcelasAtuais[0]?.contaId ?? null;
  const provisaoAnterior = parcelasAtuais[0]?.provisaoId ?? null;

  const novas: Transacao[] = geradas.map((p, i) => ({
    id: '',
    data: p.data,
    valorCents: p.valorCents,
    tipo: 'DESPESA' as const,
    descricao: `${descricao} (${p.parcelaNum}/${numParcelas})`,
    metodo: metodoAnterior,
    categoriaId,
    contaId: contaAnterior,
    contaDestinoId: null,
    provisaoId: provisaoAnterior,
    parcelamentoId: atual.id,
    parcelaNum: p.parcelaNum,
    estornoDeId: null,
    cicloId: cicloIdsDestino[i] ?? null,
    pagoEm: null,
  }));

  // TUDO OU NADA (§5.1 ticket 1): apagar as antigas, criar as novas e mexer
  // nos saldos numa única transação de banco. Os efeitos são o LÍQUIDO entre
  // a reversão das antigas (-1) e a aplicação das novas (+1) — quando o valor
  // total não muda, o líquido é zero e nenhum saldo é tocado, em vez de ser
  // debitado e recreditado com uma janela de inconsistência no meio.
  const efeitos = somarEfeitos([
    ...parcelasAtuais.map((transacao) => ({ transacao, sinal: -1 as const })),
    ...novas.map((transacao) => ({ transacao, sinal: +1 as const })),
  ]);
  await deps.transacoes.aplicarLote({
    excluir: parcelasAtuais.map((t) => t.id),
    criar: novas,
    ajustesConta: efeitos.ajustesConta,
    ajustesProvisao: efeitos.ajustesProvisao,
  });

  await deps.parcelamentos.atualizar(atual.id, {
    valorTotalCents,
    numParcelas,
    dataCompra,
    descricao,
    categoriaId,
  });
  await recalcularSobraDosCiclosFechados(deps, ciclosFechados);
}

/**
 * Propaga `descricao`/`categoriaId` do cadastro para as parcelas existentes —
 * a descrição da parcela espelha a da compra (`"{descricao} ({k}/{n})"`,
 * mesmo formato que `criarParcelamento` monta).
 *
 * `descricao` sozinha é cosmética e nunca passa pela guarda de
 * retroatividade. `categoriaId`, ao contrário, **mexe em dinheiro por
 * tabela**: `sobraCiclo` → `gastoRealizadoCents` → `contaComoVerbaVariavel`
 * (`src/domain/finance/teto.ts`) filtra transação por `grupoCategoria ===
 * 'VARIAVEL'`, então reclassificar a categoria de uma parcela muda o gasto
 * realizado do ciclo em que ela caiu. Trocar a categoria de parcela de ciclo
 * FECHADO sem recalcular `sobraCents` corrompe o congelado silenciosamente —
 * por isso passa pela mesma guarda de `exigirConfirmacaoSeRetroativo` +
 * `recalcularSobraDosCiclosFechados` que qualquer outra edição de dinheiro
 * usa (R2).
 *
 * A categoria de destino só é obrigada a ser de grupo VARIAVEL (D-11)
 * quando alguma parcela afetada ainda está em ciclo ABERTO (ou sem ciclo
 * resolvido) — nesse caso trocar para FIXO/RENDA faria a parcela parar de
 * consumir o teto diário por fora da regra oficial de "parcela nunca é
 * deduzida da verba". Quando TODAS as parcelas afetadas já estão em ciclo
 * fechado, o teto daquele ciclo está congelado e não há nada para "sumir" —
 * é só correção de cadastro histórico, e a guarda de retroatividade acima já
 * garante que `sobraCents` reflete a categoria nova.
 */
async function editarCamposLivres(
  deps: Deps,
  atual: Parcelamento,
  patch: PatchParcelamento,
  parcelasAtuais: readonly Transacao[],
  confirmarRetroativo: boolean,
  cicloIdsFechados: ReadonlySet<string>,
): Promise<void> {
  const descricao = patch.descricao ?? atual.descricao;
  const categoriaId = patch.categoriaId !== undefined ? patch.categoriaId : atual.categoriaId;
  const categoriaMudou = patch.categoriaId !== undefined && patch.categoriaId !== atual.categoriaId;
  const metodoMudou = patch.metodo !== undefined;
  const temParcelaEmCicloNaoFechado = parcelasAtuais.some(
    (t) => !(t.cicloId != null && cicloIdsFechados.has(t.cicloId)),
  );

  if (categoriaMudou && temParcelaEmCicloNaoFechado) {
    await validarCategoriaVariavel(deps, categoriaId);
  }

  // Só `categoriaId` dispara a guarda: é ela que decide se o gasto conta como
  // verba variável. `descricao` e `metodo` não entram em nenhuma fórmula (ver
  // `PatchParcelamento.metodo`), então exigir confirmação retroativa para eles
  // treinaria o dono a clicar "confirmar" sem ler — que é como a guarda de
  // verdade perde o efeito.
  const ciclosFechados = categoriaMudou
    ? await exigirConfirmacaoSeRetroativo(deps, parcelasAtuais.map((t) => t.cicloId), confirmarRetroativo)
    : [];

  await deps.parcelamentos.atualizar(atual.id, { descricao, categoriaId });

  for (const parcela of parcelasAtuais) {
    const novaDescricao = `${descricao} (${parcela.parcelaNum}/${atual.numParcelas})`;
    const novoMetodo = metodoMudou ? (patch.metodo ?? null) : parcela.metodo;
    if (
      parcela.descricao !== novaDescricao ||
      parcela.categoriaId !== categoriaId ||
      parcela.metodo !== novoMetodo
    ) {
      await deps.transacoes.atualizar(parcela.id, {
        descricao: novaDescricao,
        categoriaId,
        metodo: novoMetodo,
      });
    }
  }

  if (categoriaMudou) {
    await recalcularSobraDosCiclosFechados(deps, ciclosFechados);
  }
}

/**
 * Edita o cadastro do parcelamento. `descricao`/`categoriaId` são sempre
 * editáveis e se propagam para as parcelas. `valorTotalCents`/`numParcelas`/
 * `dataCompra` só são aceitos quando não há parcela paga nem em ciclo
 * fechado — caso contrário lança `ParcelamentoImutavelError` sem alterar nada
 * (checagem antes de qualquer escrita).
 */
export async function editarParcelamento(
  deps: Deps,
  id: string,
  patch: PatchParcelamento,
  confirmarRetroativo = false,
): Promise<Parcelamento> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  const atual = await deps.parcelamentos.obter(id);
  if (!atual) throw new Error('Parcelamento não encontrado.');

  const parcelasAtuais = await deps.transacoes.listarPorParcelamento(id);
  const parcelasPagas = parcelasAtuais.filter((t) => t.pagoEm != null).length;
  const cicloIdsFechados = await cicloIdsFechadosDas(deps, parcelasAtuais);
  const parcelasEmCicloFechado = parcelasAtuais.filter(
    (t) => t.cicloId != null && cicloIdsFechados.has(t.cicloId),
  ).length;

  const mexeEmDinheiroOuData =
    patch.valorTotalCents !== undefined || patch.numParcelas !== undefined || patch.dataCompra !== undefined;

  if (mexeEmDinheiroOuData) {
    // Parcelamento encerrado já teve suas parcelas futuras apagadas
    // (`encerradoEm` carimbado) — regenerar aqui ressuscitaria dívida
    // cancelada com o cadastro continuando marcado como encerrado (achado
    // ALTO #2 da auditoria). Checagem vem antes de `ParcelamentoImutavelError`
    // porque é mais específica: um encerramento comum zera `parcelasAtuais`,
    // então os guard-clauses de paga/ciclo-fechado abaixo nem disparariam.
    if (atual.encerradoEm != null) {
      throw new ParcelamentoEncerradoError(atual.encerradoEm);
    }
    if (parcelasPagas > 0 || parcelasEmCicloFechado > 0) {
      throw new ParcelamentoImutavelError(parcelasPagas, parcelasEmCicloFechado);
    }
    await regenerarParcelas(deps, atual, patch, parcelasAtuais, confirmarRetroativo);
  } else if (
    patch.descricao !== undefined ||
    patch.categoriaId !== undefined ||
    patch.metodo !== undefined
  ) {
    await editarCamposLivres(deps, atual, patch, parcelasAtuais, confirmarRetroativo, cicloIdsFechados);
  }

  const atualizado = await deps.parcelamentos.obter(id);
  if (!atualizado) throw new Error('Parcelamento não encontrado após edição.');
  return atualizado;
}
