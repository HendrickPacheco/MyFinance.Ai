import { rotaAgente, ErroApi } from '@/agent-api';
import { paramsCicloIdSchema } from '@/agent-api/schemas/ciclos';
import { obterDetalheCicloAgente } from '@/application/agente-consultas';

/** Detalhe de um ciclo (inclusive fechado): totais congelados + gasto por categoria. */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', params: paramsCicloIdSchema },
  async ({ deps, params }) => {
    const detalhe = await obterDetalheCicloAgente(deps, params.id);
    if (!detalhe) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Ciclo não encontrado.');
    return detalhe;
  },
);
