import { ErroApi, rotaAgente } from '@/agent-api';
import { queryLimiteOpcionalSchema } from '@/agent-api/schemas/ciclos';
import { obterDestinoDaRendaSomenteLeitura } from '@/application/destino-da-renda';

/**
 * Decomposição de "para onde vai a renda" do ciclo em curso (G8): blocos de
 * topo, disponível para gastar e gasto por categoria com a ORIGEM de cada
 * parte (D-11, D-15). O MESMO read-model somente-leitura que alimenta a
 * ferramenta `para_onde_vai_a_renda` do copiloto — sem o vocabulário
 * traduzido para conversa, que é responsabilidade do prompt do copiloto, não
 * desta API.
 */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', query: queryLimiteOpcionalSchema },
  async ({ deps, query }) => {
    const estado = await obterDestinoDaRendaSomenteLeitura(deps);
    if (!estado) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Não há ciclo aberto no momento.');

    const porCategoria =
      query.limite === undefined ? estado.porCategoria : estado.porCategoria.slice(0, query.limite);

    return { ...estado, porCategoria };
  },
);
