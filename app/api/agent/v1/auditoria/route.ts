import { rotaAgente } from '@/agent-api';
import { auditoriaQuerySchema } from '@/agent-api/schemas/importacao-admin';
import { listarAuditoriaAgente } from '@/application/auditoria';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read', query: auditoriaQuerySchema }, async ({ deps, query }) => {
  const pagina = await listarAuditoriaAgente(deps, {
    de: query.de ? new Date(query.de) : undefined,
    ate: query.ate ? new Date(query.ate) : undefined,
    entidade: query.entidade,
    acao: query.acao,
    tokenId: query.tokenId,
    dryRun: query.dryRun === undefined ? undefined : query.dryRun === 'true',
    cursor: query.cursor,
    limite: query.limite,
  });
  return { auditoria: pagina.itens, proximoCursor: pagina.proximoCursor };
});
