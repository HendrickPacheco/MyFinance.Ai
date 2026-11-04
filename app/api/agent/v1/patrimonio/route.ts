import { rotaAgente } from '@/agent-api';
import { obterPatrimonio } from '@/application/patrimonio';

export const dynamic = 'force-dynamic';

/** Snapshots, curva e divergências de conciliação — tudo que `obterPatrimonio` já devolve. */
export const GET = rotaAgente({ escopo: 'read' }, async ({ deps }) => {
  return obterPatrimonio(deps);
});
