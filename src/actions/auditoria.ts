'use server';

/**
 * Server action de LEITURA da trilha de auditoria do agente (tela
 * `/config/auditoria`). Só valida e delega a `listarAuditoriaAgente`
 * (`src/application/auditoria.ts`) — a MESMA porta que `GET /auditoria` da
 * API do agente usa, para o dono ver pela UI exatamente o que o agente
 * externo também devolveria de si mesmo.
 */
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import { listarAuditoriaAgente } from '@/application/auditoria';
import type { PaginaAuditoriaAgente } from '@/domain/ports/auditoria';

const filtroAuditoriaSchema = z.object({
  entidade: z.string().min(1).optional(),
  acao: z.enum(['CREATE', 'UPDATE', 'DELETE', 'ACTION']).optional(),
  tokenId: z.string().min(1).optional(),
  incluirDryRun: z.boolean().optional(),
  cursor: z.string().min(1).optional(),
  limite: z.number().int().min(1).max(200).optional().default(50),
});

export async function listarAuditoriaAction(
  entrada: unknown,
): Promise<Resultado<PaginaAuditoriaAgente>> {
  return executar(async () => {
    const validado = filtroAuditoriaSchema.parse(entrada);
    const deps = await criarDeps();

    // A tela por default mostra só escrita REAL; "incluir dryRun" é o oposto
    // de um filtro `dryRun: true/false` — o dono quer "tudo", não "só o
    // simulado". Sem a flag, filtramos por `dryRun: false` explicitamente.
    return listarAuditoriaAgente(deps, {
      entidade: validado.entidade,
      acao: validado.acao,
      tokenId: validado.tokenId,
      dryRun: validado.incluirDryRun ? undefined : false,
      cursor: validado.cursor,
      limite: validado.limite,
    });
  });
}
