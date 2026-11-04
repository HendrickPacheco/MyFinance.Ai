import { rotaAgente } from '@/agent-api';
import { queryCompararCiclosSchema } from '@/agent-api/schemas/ciclos';
import { compararCiclos } from '@/application/agente-consultas';

/** `?ids=a,b,c` compara ciclos específicos, na ordem dada; sem `ids`, compara os últimos `?ultimos=N` fechados (default 2). */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: queryCompararCiclosSchema },
  async ({ deps, query }) => {
    return compararCiclos(deps, { ids: query.ids, ultimos: query.ultimos });
  },
);
