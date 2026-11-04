import { rotaAgente, rotaEscrita, ErroApi } from '@/agent-api';
import {
  idParamSchema,
  editarParcelamentoBodySchema,
  encerrarParcelamentoBodySchema,
} from '@/agent-api/schemas/transacoes';
import {
  obterParcelamentoResumo,
  editarParcelamento,
  encerrarParcelamento,
} from '@/application/parcelamentos';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read', params: idParamSchema }, async ({ deps, params }) => {
  const parcelamento = await obterParcelamentoResumo(deps, params.id);
  if (!parcelamento) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Parcelamento não encontrado.');
  return { parcelamento };
});

export const PATCH = rotaEscrita(
  {
    escopo: 'write',
    params: idParamSchema,
    body: editarParcelamentoBodySchema,
    entidade: 'Parcelamento',
    acao: 'UPDATE',
  },
  async ({ deps, params, body, auditar }) => {
    const antes = await deps.parcelamentos.obter(params.id);
    if (!antes) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Parcelamento não encontrado.');

    const { confirmarRetroativo, ...patch } = body;
    const depois = await editarParcelamento(deps, params.id, patch, confirmarRetroativo ?? false);
    auditar({ entidadeId: params.id, antes, depois });
    return { parcelamento: depois };
  },
);

/**
 * `DELETE` aqui é ENCERRAR (`encerrarParcelamento`), não excluir o cadastro:
 * cancela as parcelas futuras ainda não pagas e preserva pagas e as de ciclo
 * fechado (R1) — o app não tem um caminho de exclusão total do parcelamento
 * acessível por fora do fluxo de desfazer importação.
 */
export const DELETE = rotaEscrita(
  {
    escopo: 'write',
    params: idParamSchema,
    body: encerrarParcelamentoBodySchema,
    entidade: 'Parcelamento',
    acao: 'DELETE',
  },
  async ({ deps, params, body, auditar }) => {
    const antes = await deps.parcelamentos.obter(params.id);
    if (!antes) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Parcelamento não encontrado.');

    const resultado = await encerrarParcelamento(deps, params.id, body.confirmarRetroativo ?? false);
    auditar({ entidadeId: params.id, antes, depois: resultado });
    return { resultado };
  },
);
