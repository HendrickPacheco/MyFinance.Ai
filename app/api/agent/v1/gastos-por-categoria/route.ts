import { ErroApi, rotaAgente } from '@/agent-api';
import { queryGastosPorCategoriaSchema } from '@/agent-api/schemas/ciclos';
import { obterGastosPorCategoria } from '@/application/agente-consultas';

/** `?cicloId=...` para um ciclo específico, OU `?de=YYYY-MM-DD&ate=YYYY-MM-DD` para um intervalo livre — nunca os dois. */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: queryGastosPorCategoriaSchema },
  async ({ deps, query }) => {
    const resultado = await obterGastosPorCategoria(deps, query);
    if (!resultado) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Ciclo não encontrado.');
    return resultado;
  },
);
