import { rotaAgente, rotaEscrita, ErroApi } from '@/agent-api';
import { idParamSchema, transacaoBodySchema, excluirTransacaoBodySchema } from '@/agent-api/schemas/transacoes';
import { editarTransacao, excluirTransacao } from '@/application/transacoes';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read', params: idParamSchema }, async ({ deps, params }) => {
  const transacao = await deps.transacoes.obter(params.id);
  if (!transacao) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Transação não encontrada.');
  return { transacao };
});

export const PATCH = rotaEscrita(
  {
    escopo: 'write',
    params: idParamSchema,
    body: transacaoBodySchema,
    entidade: 'Transacao',
    acao: 'UPDATE',
  },
  async ({ deps, params, body, auditar }) => {
    const antes = await deps.transacoes.obter(params.id);
    if (!antes) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Transação não encontrada.');

    const depois = await editarTransacao(deps, params.id, body);
    auditar({ entidadeId: params.id, antes, depois });
    return { transacao: depois };
  },
);

export const DELETE = rotaEscrita(
  {
    escopo: 'write',
    params: idParamSchema,
    body: excluirTransacaoBodySchema,
    entidade: 'Transacao',
    acao: 'DELETE',
  },
  async ({ deps, params, body, auditar }) => {
    const antes = await deps.transacoes.obter(params.id);
    if (!antes) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Transação não encontrada.');

    await excluirTransacao(deps, params.id, body.confirmarRetroativo ?? false);
    auditar({ entidadeId: params.id, antes, depois: null });
    return { excluida: true };
  },
);
