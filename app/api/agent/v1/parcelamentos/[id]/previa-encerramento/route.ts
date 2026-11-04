import { rotaAgente, ErroApi } from '@/agent-api';
import { idParamSchema } from '@/agent-api/schemas/transacoes';
import { previaEncerramentoParcelamento } from '@/application/parcelamentos';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read', params: idParamSchema }, async ({ deps, params }) => {
  const existe = await deps.parcelamentos.obter(params.id);
  if (!existe) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Parcelamento não encontrado.');

  const previa = await previaEncerramentoParcelamento(deps, params.id);
  return { previa };
});
