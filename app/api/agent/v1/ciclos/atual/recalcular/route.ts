import { rotaEscrita } from '@/agent-api';
import { recalcularCicloAtual } from '@/application/ciclos';

/**
 * Recongela os parâmetros do ciclo atual a partir da Config vigente (SPEC
 * 5.2) — ação explícita, histórico do ciclo em curso é alterado. Sem corpo.
 */
export const dynamic = 'force-dynamic';

export const POST = rotaEscrita(
  { escopo: 'admin', entidade: 'Ciclo', acao: 'ACTION', status: 200 },
  async ({ deps, auditar }) => {
    const antes = await deps.ciclos.obterAtual(deps.relogio.hoje());
    const ciclo = await recalcularCicloAtual(deps);

    auditar({ entidadeId: ciclo.id, antes, depois: ciclo });

    return { ciclo, verbaVariavelAntesCents: antes?.verbaVariavelCents ?? null };
  },
);
