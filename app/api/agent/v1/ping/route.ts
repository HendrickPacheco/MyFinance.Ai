import { rotaAgente } from '@/agent-api';

/** Rota de fumaça da API do agente — prova autenticação + escopo de ponta a ponta. */
export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read' }, async ({ deps, donoId, tokenId, escopos }) => {
  return { ok: true, donoId, tokenId, escopos, hoje: deps.relogio.hoje() };
});
