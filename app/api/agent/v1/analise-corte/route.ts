import { rotaAgente } from '@/agent-api';
import { queryNumCiclosOpcionalSchema } from '@/agent-api/schemas/ciclos';
import { obterAnalise } from '@/application/analise';

/**
 * Análise de corte (SPEC 5.5): ranking de categorias por custo anualizado,
 * tendência e essencialidade, nos últimos `?numCiclos=N` ciclos fechados
 * (default 3). O MESMO caso de uso que alimenta a ferramenta `analise_corte`
 * do copiloto.
 */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: queryNumCiclosOpcionalSchema },
  async ({ deps, query }) => {
    return obterAnalise(deps, query.numCiclos);
  },
);
