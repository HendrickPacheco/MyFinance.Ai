/**
 * Casos de uso de CONFIRMAÇÃO da importação de fatura (I3 do
 * `TASKS-IMPORTACAO.md`, revisão D-18 de 25/08/2026 — §15.7).
 *
 * D-18: toda linha que vira lançamento é confirmada INDIVIDUALMENTE. Não há
 * aprovação em bloco do que grava — o que já casa com o registro existente
 * (`CASA_VARIAVEL`/`CASA_PARCELA`) é apenas marcado resolvido, sem clique.
 *
 * Este módulo só ORQUESTRA (regra 4 do CLAUDE.md): a conciliação em si é
 * função pura em `domain/finance/importacao.ts` e já rodou antes — o que
 * chega aqui é o veredito de UMA linha já decidida, e a única pergunta é
 * "que caso de uso existente executa isso". Nenhuma regra de cálculo nasce
 * neste arquivo.
 *
 * 🔴 A tradução mais cara do repo mora aqui: `CASA_CUSTO_FIXO` NUNCA chama
 * `criarTransacao`. Custo fixo já está descontado em `Ciclo.fixosCents` no
 * nascimento do ciclo — criar uma `Transacao` para ele conta o gasto duas
 * vezes e derruba o teto diário do dono (ver a tabela da §4.4 do plano, que
 * também está registrada no `CLAUDE.md`). A ação correta é
 * `marcarCustoFixoPago`, que é rastreamento puro.
 */
import type { Deps } from '../deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type {
  DecisaoItemImportado,
  Importacao,
  ItemImportado,
  Transacao,
} from '@/domain/model/entidades';
import { ItemImportadoJaGravadoError } from '@/domain/ports/repositorios';
import { addMeses } from '@/shared/data';
import { criarTransacao, criarParcelamento, resolverCicloId } from '../transacoes';
import { exigirConfirmacaoSeRetroativo } from '../retroatividade';
import { marcarCustoFixoPago } from '../pagamentos';

// ── Erros nomeados (padrão do repo: um por modo de falha acionável) ────────

export class ImportacaoInexistenteError extends Error {
  constructor(importacaoId: string) {
    super(`Importação inexistente: ${importacaoId}`);
    this.name = 'ImportacaoInexistenteError';
  }
}

export class ItemImportadoInexistenteError extends Error {
  constructor(itemId: string) {
    super(`Item de importação inexistente: ${itemId}`);
    this.name = 'ItemImportadoInexistenteError';
  }
}

/** A linha não tem `data` resolvida (ambígua na transcrição) e nenhum ajuste supriu uma. */
export class ItemImportadoSemDataError extends Error {
  constructor(itemId: string) {
    super(
      `Item de importação ${itemId} não tem data resolvida — informe um ajuste de data para confirmar.`,
    );
    this.name = 'ItemImportadoSemDataError';
  }
}

/** Veredito `NOVA_PARCELA_ORFA` sem `parcelaAtual`/`parcelaTotal` — não deveria existir, é defesa. */
export class ItemImportadoSemParcelaError extends Error {
  constructor(itemId: string) {
    super(
      `Item de importação ${itemId} tem veredito NOVA_PARCELA_ORFA mas não trouxe parcela/total da fatura.`,
    );
    this.name = 'ItemImportadoSemParcelaError';
  }
}

/** `CASA_CUSTO_FIXO` sem `alvoId` — a conciliação deveria sempre preenchê-lo. Defesa. */
export class ItemImportadoSemAlvoError extends Error {
  constructor(itemId: string) {
    super(
      `Item de importação ${itemId} tem veredito CASA_CUSTO_FIXO mas não trouxe o custo fixo casado.`,
    );
    this.name = 'ItemImportadoSemAlvoError';
  }
}

/**
 * D-17c: parcelamento importado NUNCA gera transação em ciclo fechado — sem
 * a válvula de escape de `confirmarRetroativo` que `NOVA_AVULSA` tem.
 * `parcelaInicial` já resolve as parcelas ANTERIORES (nunca são geradas);
 * este erro cobre a parcela ATUAL, que é a que a fatura confirmada
 * representa e ainda assim pode cair num ciclo já encerrado.
 */
export class ParcelamentoRetroativoBloqueadoError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly cicloId: string,
  ) {
    super(
      `Item de importação ${itemId} cai no ciclo já fechado ${cicloId}. Parcelamento ` +
        'importado nunca gera transação em ciclo fechado — resolva esta linha manualmente.',
    );
    this.name = 'ParcelamentoRetroativoBloqueadoError';
  }
}

/** `AMBIGUA` exige escolha explícita do dono (candidato ou "nenhum") — nunca auto-aprovada. */
export class AmbiguidadeNaoResolvidaError extends Error {
  constructor(
    public readonly itemId: string,
    motivo: string,
  ) {
    super(`Item de importação ${itemId} é ambíguo e ainda não foi resolvido: ${motivo}`);
    this.name = 'AmbiguidadeNaoResolvidaError';
  }
}

/** A transação escolhida para desambiguar não existe (ou é de outro dono). */
export class CandidatoAmbiguoInvalidoError extends Error {
  constructor(public readonly transacaoId: string) {
    super(`A transação ${transacaoId} escolhida para desambiguar não foi encontrada.`);
    this.name = 'CandidatoAmbiguoInvalidoError';
  }
}

// ── Entrada e saída ──────────────────────────────────────────────────────

/** Ajustes que o dono fez na tela antes de confirmar a linha. */
export interface AjustesConfirmacao {
  categoriaId?: string | null;
  data?: string;
  descricao?: string;
  contaId?: string | null;
}

/**
 * Como o dono resolveu uma linha `AMBIGUA`. A conciliação não persiste os
 * `candidatos` (só o `vereditoMotivo` em texto, D-14) — quem escolhe um
 * candidato manda o id da transação, validado aqui contra o repositório
 * escopado por dono. Gap conhecido: sem persistir a lista de candidatos, a
 * UI precisa recalculá-la (ou reter em memória) para oferecer a escolha.
 */
export type EscolhaAmbigua = { transacaoId: string } | { semCandidato: true };

export interface EntradaConfirmacao {
  importacaoId: string;
  itemId: string;
  ajustes?: AjustesConfirmacao;
  /** Ver `TransacaoInput.confirmarRetroativo` — exigido para `NOVA_AVULSA` em ciclo fechado. */
  confirmarRetroativo?: boolean;
  /** Só é lida quando o veredito é `AMBIGUA`. */
  escolhaAmbigua?: EscolhaAmbigua;
}

export type ResultadoConfirmacao =
  | { status: 'GRAVADA'; transacaoId: string }
  | { status: 'GRAVADA_PARCELAMENTO'; parcelamentoId: string; transacaoIds: readonly string[] }
  | { status: 'MARCADA_PAGA'; custoFixoId: string }
  /** `CASA_VARIAVEL`/`CASA_PARCELA`/escolha ambígua com candidato: nada gravado, linha resolvida. */
  | { status: 'RESOLVIDA'; transacaoId: string | null }
  | { status: 'IGNORADA' }
  /** Idempotência (camada 1, §11): a linha já tinha decisão — não é `PENDENTE`. Nenhuma escrita. */
  | { status: 'JA_PROCESSADA'; decisaoAnterior: DecisaoItemImportado };

// ── Helpers internos ────────────────────────────────────────────────────

async function obterItemOuFalhar(
  deps: Deps,
  importacaoId: string,
  itemId: string,
): Promise<{ importacao: Importacao; item: ItemImportado }> {
  const encontrada = await deps.importacoes.obter(importacaoId);
  if (!encontrada) throw new ImportacaoInexistenteError(importacaoId);

  const item = encontrada.itens.find((i) => i.id === itemId);
  if (!item) throw new ItemImportadoInexistenteError(itemId);

  return { importacao: encontrada.importacao, item };
}

/** Trata a colisão de unicidade (camada 2, §11) como já-gravada, em vez de propagar erro. */
async function comoJaGravada(deps: Deps, itemId: string): Promise<ResultadoConfirmacao> {
  await deps.importacoes.registrarDecisao(itemId, 'GRAVADA');
  return { status: 'JA_PROCESSADA', decisaoAnterior: 'GRAVADA' };
}

/**
 * 🔴 O caminho mais caro que este arquivo pode produzir, ao contrário. Custo
 * fixo NUNCA vira `Transacao` — `marcarCustoFixoPago` é rastreamento puro
 * (não toca saldo, verba nem `Ciclo.fixosCents`), exatamente o que impede a
 * dupla contagem descrita no docblock do módulo.
 */
async function gravarCustoFixo(deps: Deps, item: ItemImportado): Promise<ResultadoConfirmacao> {
  if (!item.alvoId) throw new ItemImportadoSemAlvoError(item.id);

  await marcarCustoFixoPago(deps, item.alvoId);
  await deps.importacoes.registrarDecisao(item.id, 'GRAVADA');
  return { status: 'MARCADA_PAGA', custoFixoId: item.alvoId };
}

/** `CASA_VARIAVEL`/`CASA_PARCELA`: já existe, nada a gravar — só marca a linha resolvida. */
async function marcarResolvidaSemGravar(
  deps: Deps,
  item: ItemImportado,
): Promise<ResultadoConfirmacao> {
  await deps.importacoes.registrarDecisao(item.id, 'APROVADA');
  return { status: 'RESOLVIDA', transacaoId: item.alvoId };
}

async function gravarAvulsa(
  deps: Deps,
  item: ItemImportado,
  ajustes: AjustesConfirmacao | undefined,
  confirmarRetroativo: boolean,
): Promise<ResultadoConfirmacao> {
  const data = ajustes?.data ?? item.data;
  if (!data) throw new ItemImportadoSemDataError(item.id);

  // Regra 9 / §3.1 do plano: `criarTransacao` NÃO checa ciclo fechado — a
  // guarda é da importação, aqui, antes de qualquer escrita.
  const cicloId = await resolverCicloId(deps, data);
  await exigirConfirmacaoSeRetroativo(deps, [cicloId], confirmarRetroativo);

  let transacao: Transacao;
  try {
    transacao = await criarTransacao(deps, {
      valorCents: item.valorCents,
      tipo: 'DESPESA',
      data,
      descricao: ajustes?.descricao ?? item.descricaoOriginal,
      categoriaId: ajustes?.categoriaId ?? null,
      contaId: ajustes?.contaId ?? null,
      origem: 'IMPORTACAO',
      itemImportadoId: item.id,
    });
  } catch (erro) {
    if (erro instanceof ItemImportadoJaGravadoError) return comoJaGravada(deps, item.id);
    throw erro;
  }

  await deps.importacoes.registrarDecisao(item.id, 'GRAVADA');
  return { status: 'GRAVADA', transacaoId: transacao.id };
}

/**
 * NOVA_PARCELA_ORFA: uma compra parcelada que a fatura mostra a partir de
 * uma parcela intermediária (ex.: "3/12"). `item.data`/`item.valorCents` são
 * da parcela ATUAL (a linha da fatura), não da compra original — duas
 * traduções são obrigatórias antes de chamar `criarParcelamento`:
 *
 * 1. `dataCompra` que `gerarParcelas` espera é a competência da parcela 1 da
 *    compra ORIGINAL. Andamos `item.data` para trás em `parcelaAtual - 1`
 *    meses para reconstruir essa data — nunca geramos parcelas anteriores a
 *    `parcelaAtual`, só usamos a data como ÂNCORA do cálculo.
 * 2. 🔴 `valorTotalCents` não é o valor da compra inteira — é a soma só das
 *    parcelas GERADAS (`parcelaAtual`..`parcelaTotal`). Assumimos parcelas
 *    de valor igual (o caso comum, e o único que a fatura de UMA linha
 *    permite inferir): `item.valorCents * quantidadeGerada`. Passar
 *    `item.valorCents` sozinho aqui produziria um valor de parcela
 *    plausível e FALSO — exatamente o que o docblock de `gerarParcelas`
 *    alerta.
 */
async function gravarParcelaOrfa(
  deps: Deps,
  item: ItemImportado,
  ajustes: AjustesConfirmacao | undefined,
): Promise<ResultadoConfirmacao> {
  const data = ajustes?.data ?? item.data;
  if (!data) throw new ItemImportadoSemDataError(item.id);
  if (item.parcelaAtual == null || item.parcelaTotal == null) {
    throw new ItemImportadoSemParcelaError(item.id);
  }

  const quantidadeGerada = item.parcelaTotal - item.parcelaAtual + 1;
  const valorTotalCents = item.valorCents * quantidadeGerada;
  const dataCompraOriginal = addMeses(data, -(item.parcelaAtual - 1));

  // 🔴 O clamp de fim de mês NÃO é reversível, e por isso a checagem de ciclo
  // fechado tem que ser feita sobre a data que vai REALMENTE ser gravada.
  //
  // Exemplo real: linha de 31/03, parcela 2. A âncora reconstruída é
  // addMeses(31/03, -1) = 28/02 (fevereiro não tem 31), e `gerarParcelas`
  // devolve a parcela 2 em addMeses(28/02, +1) = 28/03 — três dias antes da
  // data impressa na fatura. Não existe âncora que devolva 31/03 no passo 1,
  // então a diferença é inerente ao clamp, não um bug a consertar aqui.
  //
  // O que NÃO pode acontecer é essa diferença atravessar a borda de um ciclo
  // e fazer nascer transação em ciclo FECHADO — exatamente o que a D-17c
  // existe para impedir. Por isso o bloqueio olha a data gerada, não a
  // impressa: com `diaRecebimento` alto (29, 30, 31), três dias mudam de mês
  // de competência.
  const dataDaPrimeiraParcelaGerada = addMeses(dataCompraOriginal, item.parcelaAtual - 1);

  // D-17c: bloqueio DURO, sem `confirmarRetroativo` — ver docblock da classe.
  const cicloId = await resolverCicloId(deps, dataDaPrimeiraParcelaGerada);
  if (cicloId) {
    const ciclo = await deps.ciclos.obter(cicloId);
    if (ciclo?.fechado) throw new ParcelamentoRetroativoBloqueadoError(item.id, ciclo.id);
  }

  let transacoes: Transacao[];
  try {
    transacoes = await criarParcelamento(deps, {
      descricao: ajustes?.descricao ?? item.descricaoOriginal,
      valorTotalCents,
      numParcelas: item.parcelaTotal,
      dataCompra: dataCompraOriginal,
      categoriaId: ajustes?.categoriaId ?? null,
      parcelaInicial: item.parcelaAtual,
      itemImportadoId: item.id,
    });
  } catch (erro) {
    if (erro instanceof ItemImportadoJaGravadoError) return comoJaGravada(deps, item.id);
    throw erro;
  }

  const [primeira] = transacoes;
  if (!primeira?.parcelamentoId) {
    throw new Error(`criarParcelamento não devolveu parcelas para o item ${item.id}.`);
  }

  await deps.importacoes.registrarDecisao(item.id, 'GRAVADA');
  return {
    status: 'GRAVADA_PARCELAMENTO',
    parcelamentoId: primeira.parcelamentoId,
    transacaoIds: transacoes.map((t) => t.id),
  };
}

async function resolverAmbigua(
  deps: Deps,
  item: ItemImportado,
  entrada: EntradaConfirmacao,
): Promise<ResultadoConfirmacao> {
  const escolha = entrada.escolhaAmbigua;
  if (!escolha) throw new AmbiguidadeNaoResolvidaError(item.id, item.vereditoMotivo);

  if ('semCandidato' in escolha) {
    // O dono decidiu que nenhum candidato é este gasto: vira uma linha nova.
    return gravarAvulsa(deps, item, entrada.ajustes, entrada.confirmarRetroativo ?? false);
  }

  const candidata = await deps.transacoes.obter(escolha.transacaoId);
  if (!candidata) throw new CandidatoAmbiguoInvalidoError(escolha.transacaoId);

  await deps.importacoes.registrarDecisao(item.id, 'APROVADA');
  return { status: 'RESOLVIDA', transacaoId: candidata.id };
}

// ── Casos de uso públicos ────────────────────────────────────────────────

/**
 * Confirma UMA linha da fatura, decidindo — a partir do veredito já
 * calculado pela conciliação — qual caso de uso existente executa a
 * gravação. Nunca cria dois lançamentos para o mesmo item: se a linha já
 * tem decisão (não é `PENDENTE`), esta chamada é um no-op que devolve
 * `JA_PROCESSADA` (idempotência camada 1, §11) — a violação de unicidade no
 * banco (`ItemImportadoJaGravadoError`, camada 2) é o backstop para a
 * corrida entre duas chamadas concorrentes.
 */
export async function confirmarItemImportado(
  deps: Deps,
  entrada: EntradaConfirmacao,
): Promise<ResultadoConfirmacao> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  // 7b: este caso de uso só é chamado por uma ação do DONO, nunca pela IA.
  exigirEscrita(deps.ator);

  const { item } = await obterItemOuFalhar(deps, entrada.importacaoId, entrada.itemId);

  if (item.decisao !== 'PENDENTE') {
    return { status: 'JA_PROCESSADA', decisaoAnterior: item.decisao };
  }

  switch (item.veredito) {
    case 'CASA_VARIAVEL':
    case 'CASA_PARCELA':
      return marcarResolvidaSemGravar(deps, item);

    case 'CASA_CUSTO_FIXO':
      return gravarCustoFixo(deps, item);

    case 'NOVA_AVULSA':
      return gravarAvulsa(deps, item, entrada.ajustes, entrada.confirmarRetroativo ?? false);

    case 'NOVA_PARCELA_ORFA':
      return gravarParcelaOrfa(deps, item, entrada.ajustes);

    case 'AMBIGUA':
      return resolverAmbigua(deps, item, entrada);

    case 'IGNORAR':
      await deps.importacoes.registrarDecisao(item.id, 'DESCARTADA');
      return { status: 'IGNORADA' };

    case 'REJEITADA':
      // A conciliação pura já se recusou a interpretar esta linha (valor
      // não-inteiro, data irresolúvel — D-14). Não há o que confirmar; só
      // resta tirá-la da lista de pendências.
      await deps.importacoes.registrarDecisao(item.id, 'DESCARTADA');
      return { status: 'IGNORADA' };

    default: {
      // Exaustividade: um veredito novo em `TipoVeredito` sem `case` aqui
      // para de compilar nesta linha, em vez de virar um item PENDENTE para
      // sempre em produção.
      const _exaustivo: never = item.veredito;
      throw new Error(`Veredito de importação sem tratamento: ${String(_exaustivo)}`);
    }
  }
}

/**
 * Descarta uma linha sem gravar nada — a ação explícita do dono na tela
 * (distinta do veredito `IGNORAR`, que a conciliação já decidiu sozinha).
 * Idempotente: descartar uma linha já decidida é um no-op.
 */
export async function descartarItemImportado(
  deps: Deps,
  entrada: { importacaoId: string; itemId: string },
): Promise<void> {
  exigirEscrita(deps.ator);

  const { item } = await obterItemOuFalhar(deps, entrada.importacaoId, entrada.itemId);
  if (item.decisao !== 'PENDENTE') return;

  await deps.importacoes.registrarDecisao(item.id, 'DESCARTADA');
}

export interface ResultadoFinalizacao {
  finalizada: boolean;
  itensPendentes: number;
}

/**
 * Marca o rascunho como `CONFIRMADA` quando não sobra nenhuma linha
 * `PENDENTE`. Não força nada: se houver pendências, devolve o total em vez
 * de lançar — a UI decide se avisa o dono ou mantém a tela aberta.
 */
export async function finalizarImportacao(
  deps: Deps,
  importacaoId: string,
): Promise<ResultadoFinalizacao> {
  exigirEscrita(deps.ator);

  const encontrada = await deps.importacoes.obter(importacaoId);
  if (!encontrada) throw new ImportacaoInexistenteError(importacaoId);

  const itensPendentes = encontrada.itens.filter((i) => i.decisao === 'PENDENTE').length;
  if (itensPendentes > 0) return { finalizada: false, itensPendentes };

  await deps.importacoes.marcarConfirmada(importacaoId);
  return { finalizada: true, itensPendentes: 0 };
}
