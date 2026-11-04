import { ErroApi, rotaAgente } from '@/agent-api';
import { importacaoIdParamsSchema } from '@/agent-api/schemas/importacao-admin';
import { obterImportacaoConciliada } from '@/application/importacao/conciliar';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente(
  { escopo: 'read', params: importacaoIdParamsSchema },
  async ({ deps, params }) => {
    const importacao = await obterImportacaoConciliada(deps, params.id);
    if (!importacao) {
      throw new ErroApi(404, 'NAO_ENCONTRADO', 'Importação não encontrada.');
    }
    return { importacao };
  },
);
