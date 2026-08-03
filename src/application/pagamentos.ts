/**
 * Casos de uso do rastreamento "Pago?" (coluna da planilha do usuário).
 *
 * RASTREAMENTO PURO — a regra mais importante deste arquivo: nenhuma função
 * aqui toca `Ciclo.fixosCents`, `verbaVariavelCents`, saldo de conta ou
 * qualquer efeito de cálculo. O custo fixo já foi descontado da verba quando
 * o ciclo nasceu (congelado); a parcela já é uma `Transacao` que consome
 * verba desde que foi lançada. Marcar/desmarcar só grava um estado de
 * exibição. "Pago" é sempre relativo ao CICLO ATUAL — reseta sozinho na
 * virada porque a unicidade de `PagamentoFixo` é por (custoFixoId, cicloId).
 */
import type { Deps } from './deps';
import type { Transacao } from '@/domain/model/entidades';
import { garantirCicloAtual } from './ciclos';

/**
 * Lançado quando se tenta marcar/desmarcar como paga uma transação que não é
 * uma parcela de parcelamento (`parcelamentoId == null`). Só parcelas têm a
 * coluna "Pago?" — uma despesa avulsa não tem esse conceito no modelo da
 * planilha original.
 */
export class TransacaoNaoParceladaError extends Error {
  constructor(transacaoId: string) {
    super(`Transação ${transacaoId} não é uma parcela — só parcelas podem ser marcadas como pagas.`);
    this.name = 'TransacaoNaoParceladaError';
  }
}

export class TransacaoInexistenteError extends Error {
  constructor(transacaoId: string) {
    super(`Transação inexistente: ${transacaoId}`);
    this.name = 'TransacaoInexistenteError';
  }
}

/** Marca um custo fixo como pago no ciclo atual. Idempotente (upsert no adapter). */
export async function marcarCustoFixoPago(deps: Deps, custoFixoId: string): Promise<void> {
  const { ciclo } = await garantirCicloAtual(deps);
  await deps.pagamentosFixos.marcarPago(custoFixoId, ciclo.id, deps.relogio.hoje());
}

/** Desmarca um custo fixo pago no ciclo atual. Idempotente: desmarcar o que já não está marcado não erra. */
export async function desmarcarCustoFixoPago(deps: Deps, custoFixoId: string): Promise<void> {
  const { ciclo } = await garantirCicloAtual(deps);
  await deps.pagamentosFixos.desmarcarPago(custoFixoId, ciclo.id);
}

async function obterParcelaOuFalhar(deps: Deps, transacaoId: string): Promise<Transacao> {
  const transacao = await deps.transacoes.obter(transacaoId);
  if (!transacao) throw new TransacaoInexistenteError(transacaoId);
  if (!transacao.parcelamentoId) throw new TransacaoNaoParceladaError(transacaoId);
  return transacao;
}

/** Marca uma parcela como paga. Idempotente: marcar de novo só reescreve a data. */
export async function marcarParcelaPaga(deps: Deps, transacaoId: string): Promise<Transacao> {
  await obterParcelaOuFalhar(deps, transacaoId);
  return deps.transacoes.marcarPaga(transacaoId, deps.relogio.hoje());
}

/** Desmarca uma parcela paga. */
export async function desmarcarParcelaPaga(deps: Deps, transacaoId: string): Promise<Transacao> {
  await obterParcelaOuFalhar(deps, transacaoId);
  return deps.transacoes.marcarPaga(transacaoId, null);
}
