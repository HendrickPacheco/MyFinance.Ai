/**
 * Caso de uso de LEITURA da trilha de auditoria do agente de IA externo (API
 * v1). Só orquestra: a persistência em si é `deps.auditoria`
 * (`AuditoriaAgentePort`, `src/domain/ports/auditoria.ts`); este arquivo
 * existe para que a tela `/config/auditoria` (dono, via sessão de cookie) e a
 * rota `GET /auditoria` do agente (dono, via token) passem pelo MESMO
 * portão — nunca duas implementações da mesma regra.
 *
 * OWNER-only, como a memória do copiloto (D-12): a trilha mostra CADA
 * escrita que o agente fez, inclusive o `antes`/`depois` de dados
 * financeiros — mais sensível que o que um VIEWER já enxerga nas telas
 * normais.
 */
import { exigirOwner } from '@/domain/auth/permissoes';
import type { FiltroAuditoriaAgente, PaginaAuditoriaAgente } from '@/domain/ports/auditoria';
import type { Deps } from './deps';

export async function listarAuditoriaAgente(
  deps: Deps,
  filtro: FiltroAuditoriaAgente,
): Promise<PaginaAuditoriaAgente> {
  exigirOwner(deps.ator);
  return deps.auditoria.listar(filtro);
}
