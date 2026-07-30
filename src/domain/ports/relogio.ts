/**
 * Porta de relógio (provider). O domínio nunca chama `new Date()` direto:
 * depende desta abstração, e a infraestrutura injeta uma implementação que
 * respeita o timezone da Config (SPEC 5.1). Facilita testar "hoje".
 */
import type { DataCivil } from '@/shared/data';

export interface RelogioPort {
  /** Data civil de hoje, no fuso configurado. */
  hoje(): DataCivil;
  /** Instante atual (para carimbos createdAt/fechadoEm, quando necessário). */
  agora(): Date;
}
