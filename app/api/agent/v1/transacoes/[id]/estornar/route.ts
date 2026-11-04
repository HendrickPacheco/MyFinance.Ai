import { rotaEscrita } from '@/agent-api';
import { idParamSchema, estornarBodySchema } from '@/agent-api/schemas/transacoes';
import { estornarTransacao } from '@/application/transacoes';

export const dynamic = 'force-dynamic';

export const POST = rotaEscrita(
  {
    escopo: 'write',
    params: idParamSchema,
    body: estornarBodySchema,
    entidade: 'Transacao',
    acao: 'ACTION',
    status: 201,
  },
  async ({ deps, params, body, auditar }) => {
    const estorno = await estornarTransacao(
      deps,
      params.id,
      body.valorCents,
      body.data,
      body.confirmarRetroativo ?? false,
    );
    auditar({ entidadeId: estorno.id, depois: estorno });
    return { estorno };
  },
);
