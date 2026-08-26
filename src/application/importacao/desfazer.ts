/**
 * Caso de uso de DESFAZER uma importação de fatura inteira (I4 do
 * `TASKS-IMPORTACAO.md` §15.4/§15.5).
 *
 * A D-18 (§15.7) tirou o risco original do desfazer — cada linha nova já
 * passa pelos olhos do dono antes de existir, então um clique não grava mais
 * "N erros de transcrição de uma vez". O desfazer em bloco continua no
 * escopo por outro motivo: é a saída para **"importei a fatura errada"** —
 * o dono decide que a importação inteira não devia ter acontecido e quer o
 * efeito dela revertido de uma vez, sem clicar em "desfazer" linha a linha.
 *
 * Este módulo só ORQUESTRA (regra 4 do CLAUDE.md): a tabela "dinheiro sai
 * por três caminhos" do CLAUDE.md é o mapa exato do que precisa ser desfeito
 * — cada caminho pelo caso de uso que já sabe revertê-lo:
 *
 *  - `criarTransacao` (linha avulsa)         → `excluirTransacao`
 *  - `criarParcelamento` (parcela órfã)      → apaga as parcelas + o cadastro
 *  - `marcarCustoFixoPago` (rastreamento)    → `desmarcarCustoFixoPago`
 *
 * 🔴 A mesma tradução cara de `confirmar.ts` mora aqui ao contrário:
 * `CASA_CUSTO_FIXO` NUNCA criou uma `Transacao` (rastreamento puro), então
 * desfazê-lo NUNCA pode tentar apagar uma. A única reversão possível é
 * `desmarcarCustoFixoPago`.
 *
 * ─── Como o caso de uso acha o que foi gravado ───
 *
 * `Transacao.itemImportadoId` é a aresta de volta (`@unique`, I1). Para
 * `NOVA_AVULSA` ela aponta a transação inteira; para `NOVA_PARCELA_ORFA` só
 * a parcela `parcelaInicial` a carrega (ver `ParcelamentoInput.itemImportadoId`
 * em `transacoes.ts`) — as demais parcelas do mesmo `Parcelamento` são
 * alcançadas por `parcelamentoId`, não por `itemImportadoId`.
 * `listarPorItensImportados` devolve só as âncoras; este módulo segue a
 * partir delas.
 *
 * ─── Guardas que decidem a corretude ───
 *
 * **Ciclo fechado.** Cada reversão financeira (transação avulsa ou
 * parcelamento) passa pela MESMA guarda de retroatividade que qualquer outra
 * exclusão no app (`exigirConfirmacaoSeRetroativo`, via `excluirTransacao`
 * ou verificação equivalente aqui) — nunca um caminho de exclusão paralelo
 * sem ela. Um parcelamento importado pode ter parcelas em ciclos diferentes
 * (algumas hoje fechadas, mesmo que não estivessem no momento da confirmação
 * — D-17c só impede NASCER em ciclo fechado, não impede que um ciclo feche
 * DEPOIS); desfazê-lo exige apagar TODAS as parcelas de uma vez (a FK
 * `Transacao.parcelamentoId` é `Restrict`, e um cadastro com parcela paga
 * "esquecida" para trás é dívida fantasma), então a presença de QUALQUER
 * parcela em ciclo fechado bloqueia a exclusão do parcelamento inteiro até
 * `confirmarRetroativo`.
 *
 * **Transação editada depois de importada.** Decisão explícita: o desfazer
 * apaga mesmo assim. Não existe hoje nenhum campo em `Transacao` que
 * registre "foi editada depois de criada" — inventar um granularia essa
 * distinção fora do escopo desta fase (o plano pede explicitamente para não
 * inventar um). O comportamento de fato é idêntico ao de qualquer outra
 * exclusão manual do app: `excluirTransacao` já apaga uma transação editada
 * sem perguntar "isso foi editado?", e o desfazer de importação reusa
 * exatamente esse caminho — não é um comportamento NOVO, é o de sempre,
 * aplicado a um registro que por acaso nasceu de uma importação.
 *
 * **Idempotência.** Uma linha só é revertida se `decisao === 'GRAVADA'` ou
 * `'APROVADA'` — depois de reaberta ela volta a `PENDENTE` e uma segunda
 * chamada simplesmente não a encontra mais nesses dois conjuntos. Chamar
 * `desfazerImportacao` duas vezes é inofensivo: a segunda vez não tem nada
 * de novo para reverter (ou só o que ficou bloqueado por ciclo fechado na
 * primeira, que continua bloqueado até `confirmarRetroativo`).
 */
import type { Deps } from '../deps';
import { exigirEscrita } from '@/domain/auth/permissoes';
import type { ItemImportado, Transacao } from '@/domain/model/entidades';
import { desmarcarCustoFixoPago } from '../pagamentos';
import { excluirTransacao, somarEfeitos } from '../transacoes';
import {
  CicloFechadoError,
  ciclosFechadosEntre,
  recalcularSobraDosCiclosFechados,
} from '../retroatividade';
import { ImportacaoInexistenteError, ItemImportadoSemAlvoError } from './confirmar';

export { ImportacaoInexistenteError };

/** Uma linha que a importação tinha gravado, mas que o desfazer não conseguiu reverter — e por quê. */
export interface LinhaNaoRevertida {
  itemId: string;
  motivo: string;
}

export interface ResultadoDesfazerImportacao {
  importacaoId: string;
  /**
   * Sempre `'DESCARTADA'` ao final desta chamada (decisão de produto: o
   * desfazer é o gesto de abandonar a importação, não de reabri-la para
   * revisão — se o dono quiser reprocessar a mesma fatura, reimporta do
   * zero). Campo explícito, e não um literal implícito no tipo, para o
   * chamador nunca precisar adivinhar o valor.
   */
  statusFinal: 'DESCARTADA';
  /** Quantas linhas (`GRAVADA`/`APROVADA`) voltaram a `PENDENTE` nesta chamada. */
  linhasRevertidas: number;
  /** Linhas que continuam `GRAVADA` porque a reversão tocaria um ciclo fechado sem confirmação. */
  linhasNaoRevertidas: readonly LinhaNaoRevertida[];
}

/**
 * Reverte a transação avulsa (ou a parcela-âncora de um `NOVA_PARCELA_ORFA`
 * já tratado à parte) usando o mesmo caminho de exclusão de sempre —
 * `excluirTransacao` já reverte o efeito no saldo, checa retroatividade e
 * recalcula a sobra do ciclo fechado quando confirmada. `null` = revertida;
 * texto = motivo de não ter revertido.
 */
async function reverterTransacaoAvulsa(
  deps: Deps,
  transacaoId: string,
  confirmarRetroativo: boolean,
): Promise<string | null> {
  try {
    await excluirTransacao(deps, transacaoId, confirmarRetroativo);
    return null;
  } catch (erro) {
    if (erro instanceof CicloFechadoError) {
      return (
        `Esta transação pertence a um ciclo já fechado (${erro.ciclosAfetados.join(', ')}); ` +
        'confirme para revertê-la também.'
      );
    }
    throw erro;
  }
}

/**
 * Apaga TODAS as parcelas de um parcelamento (revertendo saldo/provisão
 * delas) e o cadastro em seguida — nunca uma reversão parcial, ao contrário
 * de `encerrarParcelamento` (que preserva pagas e ciclo fechado de
 * propósito). Aqui a intenção é "esta compra nunca devia ter existido no
 * app", então a única saída honesta é levar tudo ou nada.
 *
 * Idempotente: um parcelamento já apagado (`obter` devolve `null`) é tratado
 * como já revertido, sem erro — cobre a segunda chamada de
 * `desfazerImportacao` e uma corrida entre duas chamadas concorrentes.
 */
async function reverterParcelamentoInteiro(
  deps: Deps,
  parcelamentoId: string,
  confirmarRetroativo: boolean,
): Promise<string | null> {
  const parcelamento = await deps.parcelamentos.obter(parcelamentoId);
  if (!parcelamento) return null;

  const parcelas = await deps.transacoes.listarPorParcelamento(parcelamentoId);
  const ciclosFechados = await ciclosFechadosEntre(
    deps,
    parcelas.map((t) => t.cicloId),
  );

  if (ciclosFechados.length > 0 && !confirmarRetroativo) {
    return (
      `Este parcelamento tem parcela(s) em ${ciclosFechados.length} ciclo(s) já fechado(s) ` +
      `(${ciclosFechados.map((c) => c.id).join(', ')}); confirme para revertê-lo também.`
    );
  }

  if (parcelas.length > 0) {
    const efeitos = somarEfeitos(parcelas.map((transacao) => ({ transacao, sinal: -1 as const })));
    await deps.transacoes.aplicarLote({
      excluir: parcelas.map((t) => t.id),
      ajustesConta: efeitos.ajustesConta,
      ajustesProvisao: efeitos.ajustesProvisao,
    });
  }

  // A FK `Transacao.parcelamentoId` é Restrict: só chega aqui depois que
  // todas as parcelas já foram apagadas acima.
  await deps.parcelamentos.excluir(parcelamentoId);
  await recalcularSobraDosCiclosFechados(deps, ciclosFechados);
  return null;
}

/**
 * Reverte UMA linha `decisao === 'GRAVADA'`. `null` = revertida (a linha
 * pode ser reaberta); texto = motivo de continuar `GRAVADA`.
 *
 * `CASA_CUSTO_FIXO` é reconhecido pelo próprio veredito — nunca criou
 * `Transacao`, então não há âncora para procurar. Todo outro veredito que
 * chega aqui `GRAVADA` (`NOVA_AVULSA`, `NOVA_PARCELA_ORFA`, `AMBIGUA`
 * resolvida como avulsa) tem uma âncora em `itemImportadoId`: quem decide o
 * caminho de reversão é a FORMA do que foi encontrado (tem `parcelamentoId`
 * ou não), não o veredito gravado na linha — mais robusto do que replicar o
 * switch de `confirmarItemImportado` aqui.
 */
async function reverterLinhaGravada(
  deps: Deps,
  item: ItemImportado,
  ancora: Transacao | undefined,
  confirmarRetroativo: boolean,
  parcelamentosJaTratados: Map<string, string | null>,
): Promise<string | null> {
  if (item.veredito === 'CASA_CUSTO_FIXO') {
    if (!item.alvoId) throw new ItemImportadoSemAlvoError(item.id);
    await desmarcarCustoFixoPago(deps, item.alvoId);
    return null;
  }

  if (!ancora) {
    // Estado inconsistente (a linha diz GRAVADA mas não deixou rastro) —
    // não é o que este desfazer sabe corrigir. Reportado, não lançado: o
    // resto da importação continua sendo revertido normalmente.
    return 'Nenhum lançamento vinculado a esta linha foi encontrado — pode já ter sido apagado por fora da importação.';
  }

  if (ancora.parcelamentoId) {
    const jaTratado = parcelamentosJaTratados.get(ancora.parcelamentoId);
    if (jaTratado !== undefined) return jaTratado;

    const motivo = await reverterParcelamentoInteiro(deps, ancora.parcelamentoId, confirmarRetroativo);
    parcelamentosJaTratados.set(ancora.parcelamentoId, motivo);
    return motivo;
  }

  return reverterTransacaoAvulsa(deps, ancora.id, confirmarRetroativo);
}

/**
 * Desfaz uma importação inteira: cada linha `GRAVADA` tem seu efeito
 * financeiro revertido pelo caso de uso apropriado (ver docblock do módulo),
 * cada linha `APROVADA` (já casava com registro existente — nada foi criado)
 * volta a `PENDENTE` sem tocar em nenhum dado, e a importação é marcada
 * `DESCARTADA` ao final.
 *
 * `confirmarRetroativo` vale para a chamada INTEIRA: linhas que esbarram em
 * ciclo fechado sem essa confirmação permanecem `GRAVADA` (não revertidas) e
 * aparecem em `linhasNaoRevertidas` — as demais são revertidas normalmente.
 * A UI pode reapresentar o mesmo pedido com `confirmarRetroativo: true`
 * depois de mostrar ao dono o que ficou de fora.
 */
export async function desfazerImportacao(
  deps: Deps,
  importacaoId: string,
  confirmarRetroativo = false,
): Promise<ResultadoDesfazerImportacao> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirEscrita(deps.ator);

  const encontrada = await deps.importacoes.obter(importacaoId);
  if (!encontrada) throw new ImportacaoInexistenteError(importacaoId);
  const { itens } = encontrada;

  const gravados = itens.filter((i) => i.decisao === 'GRAVADA');
  const aprovados = itens.filter((i) => i.decisao === 'APROVADA');

  const ancoras =
    gravados.length > 0
      ? await deps.transacoes.listarPorItensImportados(gravados.map((i) => i.id))
      : [];
  const ancoraPorItemId = new Map(
    ancoras.filter((t): t is Transacao & { itemImportadoId: string } => t.itemImportadoId != null).map((t) => [t.itemImportadoId, t]),
  );

  const naoRevertidas: LinhaNaoRevertida[] = [];
  let revertidas = 0;
  const parcelamentosJaTratados = new Map<string, string | null>();

  for (const item of gravados) {
    const motivo = await reverterLinhaGravada(
      deps,
      item,
      ancoraPorItemId.get(item.id),
      confirmarRetroativo,
      parcelamentosJaTratados,
    );
    if (motivo) {
      naoRevertidas.push({ itemId: item.id, motivo });
      continue;
    }
    await deps.importacoes.reabrirItem(item.id);
    revertidas += 1;
  }

  // `APROVADA` (CASA_VARIAVEL/CASA_PARCELA, ou AMBIGUA resolvida com um
  // candidato existente): a linha só aponta para uma transação que já
  // existia ANTES desta importação (`item.alvoId`) — nunca a criou. Reabrir
  // é sempre seguro, sem guarda de retroatividade nenhuma, porque nenhum
  // dado é tocado.
  for (const item of aprovados) {
    await deps.importacoes.reabrirItem(item.id);
    revertidas += 1;
  }

  await deps.importacoes.marcarDescartada(importacaoId);

  return {
    importacaoId,
    statusFinal: 'DESCARTADA',
    linhasRevertidas: revertidas,
    linhasNaoRevertidas: naoRevertidas,
  };
}
