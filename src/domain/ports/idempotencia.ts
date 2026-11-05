/**
 * Porta do store de idempotência do agente (header `Idempotency-Key`).
 * Pequena e isolada de propósito: para ser testável com um fake em memória,
 * sem precisar de Postgres (ver `src/agent-api/idempotencia.test.ts`).
 */

export interface RegistroIdempotenciaSalvo {
  statusHttp: number;
  resposta: unknown;
  /** sha256 do corpo da requisição original — detecta reuso da chave com corpo diferente. */
  hashCorpo: string;
}

export interface NovoRegistroIdempotencia {
  tokenId: string;
  metodo: string;
  rota: string;
  chave: string;
  hashCorpo: string;
  statusHttp: number;
  resposta: unknown;
  expiraEm: Date;
}

export interface IdempotenciaPort {
  /** Escopado por `donoId` (construtor do adapter) — chaves de donos diferentes nunca colidem. */
  buscar(chave: string): Promise<RegistroIdempotenciaSalvo | null>;
  salvar(registro: NovoRegistroIdempotencia): Promise<void>;
  /** Higiene: remove entradas vencidas. Chamado de forma oportunista ao salvar, nunca no caminho de leitura. */
  removerExpiradas(agora: Date): Promise<void>;
}
