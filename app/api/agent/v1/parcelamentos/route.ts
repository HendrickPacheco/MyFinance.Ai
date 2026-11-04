import { rotaAgente, rotaEscrita } from '@/agent-api';
import { criarParcelamentoBodySchema } from '@/agent-api/schemas/transacoes';
import { listarParcelamentos } from '@/application/parcelamentos';
import { criarParcelamento } from '@/application/transacoes';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read' }, async ({ deps }) => {
  const parcelamentos = await listarParcelamentos(deps);
  return { parcelamentos };
});

export const POST = rotaEscrita(
  {
    escopo: 'write',
    body: criarParcelamentoBodySchema,
    entidade: 'Parcelamento',
    acao: 'CREATE',
    status: 201,
  },
  async ({ deps, body, auditar }) => {
    const parcelas = await criarParcelamento(deps, body);
    const parcelamentoId = parcelas[0]?.parcelamentoId ?? null;
    auditar({ entidadeId: parcelamentoId, depois: { parcelamentoId, parcelas } });
    return { parcelamentoId, parcelas };
  },
);
