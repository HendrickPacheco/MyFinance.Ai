import { ErroApi, rotaEscrita } from '@/agent-api';
import { upsertConta } from '@/application/config';
import { contaAtualizarSchema, paramsIdSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

/** "Excluir" conta = `PATCH { arquivada: true }` — não há DELETE (a conta pode ter histórico). */
export const PATCH = rotaEscrita(
  {
    escopo: 'write',
    body: contaAtualizarSchema,
    params: paramsIdSchema,
    entidade: 'Conta',
    acao: 'UPDATE',
  },
  async ({ deps, body, params, auditar }) => {
    const atual = await deps.contas.obter(params.id);
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Conta não encontrada.');

    const conta = await upsertConta(deps, { ...atual, ...body });
    auditar({ entidadeId: conta.id, antes: atual, depois: conta });
    return { conta };
  },
);
