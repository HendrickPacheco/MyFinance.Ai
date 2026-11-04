import { rotaAgente } from '@/agent-api';
import { obterContextoAgente } from '@/application/agente-consultas';

/**
 * O primeiro endpoint que o agente chama: tudo de uma vez — config, ciclo
 * atual (totais congelados, verba livre, ritmo diário), contas, categorias,
 * custos fixos com status de pagamento, parcelamentos ativos, provisões,
 * último snapshot de patrimônio e `hoje`. Ver `obterContextoAgente`.
 */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read' }, async ({ deps }) => {
  return obterContextoAgente(deps);
});
