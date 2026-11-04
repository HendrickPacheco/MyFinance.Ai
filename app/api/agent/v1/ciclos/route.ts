import { rotaAgente } from '@/agent-api';
import { queryListaCiclosSchema } from '@/agent-api/schemas/ciclos';
import { listarCiclosAgente } from '@/application/agente-consultas';

/** Lista o ciclo em curso (se houver) seguido dos últimos `limite` fechados, com os totais congelados. */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: queryListaCiclosSchema },
  async ({ deps, query }) => {
    return listarCiclosAgente(deps, { limite: query.limite });
  },
);
