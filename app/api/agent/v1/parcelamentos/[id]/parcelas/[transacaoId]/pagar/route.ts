import { rotaEscrita, ErroApi } from '@/agent-api';
import { parcelaParamSchema, corpoVazioSchema } from '@/agent-api/schemas/transacoes';
import { marcarParcelaPaga, desmarcarParcelaPaga } from '@/application/pagamentos';
import type { Deps } from '@/application/deps';

export const dynamic = 'force-dynamic';

/** Garante que `transacaoId` é mesmo uma parcela DESTE parcelamento — nunca de outro. */
async function exigirParcelaDoParcelamento(
  deps: Deps,
  parcelamentoId: string,
  transacaoId: string,
): Promise<void> {
  const transacao = await deps.transacoes.obter(transacaoId);
  if (!transacao || transacao.parcelamentoId !== parcelamentoId) {
    throw new ErroApi(404, 'NAO_ENCONTRADO', 'Parcela não encontrada neste parcelamento.');
  }
}

export const POST = rotaEscrita(
  {
    escopo: 'write',
    params: parcelaParamSchema,
    body: corpoVazioSchema,
    entidade: 'Transacao',
    acao: 'UPDATE',
  },
  async ({ deps, params, auditar }) => {
    await exigirParcelaDoParcelamento(deps, params.id, params.transacaoId);
    const parcela = await marcarParcelaPaga(deps, params.transacaoId);
    auditar({ entidadeId: parcela.id, depois: parcela });
    return { parcela };
  },
);

export const DELETE = rotaEscrita(
  {
    escopo: 'write',
    params: parcelaParamSchema,
    body: corpoVazioSchema,
    entidade: 'Transacao',
    acao: 'UPDATE',
  },
  async ({ deps, params, auditar }) => {
    await exigirParcelaDoParcelamento(deps, params.id, params.transacaoId);
    const parcela = await desmarcarParcelaPaga(deps, params.transacaoId);
    auditar({ entidadeId: parcela.id, depois: parcela });
    return { parcela };
  },
);
