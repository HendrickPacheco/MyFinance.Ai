/**
 * Porta da trilha de auditoria do agente de IA externo (API v1). Toda escrita
 * feita pelo agente grava uma linha aqui — é o "o que o agente mudou", sempre
 * disponível ao dono, nunca deduzido reconstruindo histórico de outra tabela.
 */

export type AcaoAuditoriaAgente = 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTION';

export interface NovaAuditoriaAgente {
  tokenId: string;
  metodo: string;
  rota: string;
  entidade: string;
  entidadeId: string | null;
  acao: AcaoAuditoriaAgente;
  /** Estado da entidade ANTES da operação. `null`/omitido para CREATE. */
  antes?: unknown;
  /** Estado da entidade DEPOIS da operação. `null`/omitido para DELETE. */
  depois?: unknown;
  dryRun: boolean;
}

export interface RegistroAuditoriaAgente {
  id: string;
  donoId: string;
  tokenId: string;
  metodo: string;
  rota: string;
  entidade: string;
  entidadeId: string | null;
  acao: AcaoAuditoriaAgente;
  antes: unknown;
  depois: unknown;
  dryRun: boolean;
  criadoEm: Date;
}

export interface FiltroAuditoriaAgente {
  de?: Date;
  ate?: Date;
  entidade?: string;
  acao?: AcaoAuditoriaAgente;
  tokenId?: string;
  /** Id do último item da página anterior (paginação por cursor nativa do Prisma). */
  cursor?: string;
  limite: number;
}

export interface PaginaAuditoriaAgente {
  itens: readonly RegistroAuditoriaAgente[];
  /** `null` = não há próxima página. */
  proximoCursor: string | null;
}

export interface AuditoriaAgentePort {
  registrar(entrada: NovaAuditoriaAgente): Promise<void>;
  /** Escopado por `donoId` (construtor do adapter), como todo repositório financeiro. */
  listar(filtro: FiltroAuditoriaAgente): Promise<PaginaAuditoriaAgente>;
}
