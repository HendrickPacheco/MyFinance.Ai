import { rotaAgente } from '@/agent-api';
import { queryProjecaoSchema } from '@/agent-api/schemas/ciclos';
import { obterProjecao } from '@/application/projecao';

/** Projeção de `?ciclos=N` ciclos a partir de hoje (default 6, teto 60). */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: queryProjecaoSchema },
  async ({ deps, query }) => {
    return obterProjecao(deps, { numCiclos: query.ciclos });
  },
);
