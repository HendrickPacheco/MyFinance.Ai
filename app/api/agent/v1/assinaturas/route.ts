import { rotaAgente } from '@/agent-api';
import { queryNumCiclosOpcionalSchema } from '@/agent-api/schemas/ciclos';
import { obterAnalise } from '@/application/analise';

/**
 * Assinaturas recorrentes detectadas nos últimos `?numCiclos=N` ciclos
 * fechados (default 3). O MESMO caso de uso (`obterAnalise`) que alimenta a
 * ferramenta `assinaturas_detectadas` do copiloto — aqui só o campo
 * `assinaturas` é exposto, sem o ranking de corte.
 */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: queryNumCiclosOpcionalSchema },
  async ({ deps, query }) => {
    const analise = await obterAnalise(deps, query.numCiclos);
    return { ciclosConsiderados: analise.ciclosConsiderados, assinaturas: analise.assinaturas };
  },
);
