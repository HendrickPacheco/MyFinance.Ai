import { rotaAgente } from '@/agent-api';
import { queryTendenciasSchema } from '@/agent-api/schemas/ciclos';
import { obterTendenciaCategoria } from '@/application/agente-consultas';

/** Série do gasto de `?categoriaId=...` pelos últimos `?ultimos=N` ciclos fechados (default 6). */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: queryTendenciasSchema },
  async ({ deps, query }) => {
    return obterTendenciaCategoria(deps, { categoriaId: query.categoriaId, ultimos: query.ultimos });
  },
);
