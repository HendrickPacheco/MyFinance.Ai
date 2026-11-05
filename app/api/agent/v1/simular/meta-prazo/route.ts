import { rotaAgente } from '@/agent-api';
import { bodySimularMetaPrazoSchema } from '@/agent-api/schemas/ciclos';
import { obterSimulacaoMetaPrazo } from '@/application/meta-prazo';

/**
 * "Quanto preciso separar por ciclo para juntar X até a data Y?" SÓ
 * LEITURA — `rotaAgente` (escopo `read`) com `POST`, corpo lido à mão.
 * Prazo anterior ao ciclo atual chega como `Error` comum e é mapeado para
 * 422 pelo kernel (`mapearErroApi`) — não precisa de tratamento ad hoc aqui.
 */
export const dynamic = 'force-dynamic';

export const POST = rotaAgente({ escopo: 'read' }, async ({ deps, req }) => {
  const corpoTexto = await req.text();
  const corpoJson: unknown = corpoTexto.trim() === '' ? {} : JSON.parse(corpoTexto);
  const dados = bodySimularMetaPrazoSchema.parse(corpoJson);

  return obterSimulacaoMetaPrazo(deps, { alvoCents: dados.alvoCents, dataLimite: dados.dataLimite });
});
