import { rotaAgente, rotaEscrita } from '@/agent-api';
import { listarTransacoesQuerySchema, transacaoBodySchema } from '@/agent-api/schemas/transacoes';
import { listarTransacoesFiltradas } from '@/application/consulta-transacoes';
import { criarTransacao } from '@/application/transacoes';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: listarTransacoesQuerySchema },
  async ({ deps, query }) => {
    const { itens, proximoCursor } = await listarTransacoesFiltradas(deps, query);
    return { transacoes: itens, proximoCursor };
  },
);

export const POST = rotaEscrita(
  {
    escopo: 'write',
    body: transacaoBodySchema,
    entidade: 'Transacao',
    acao: 'CREATE',
    status: 201,
  },
  async ({ deps, body, auditar }) => {
    const transacao = await criarTransacao(deps, body);
    auditar({ entidadeId: transacao.id, depois: transacao });
    return { transacao };
  },
);
