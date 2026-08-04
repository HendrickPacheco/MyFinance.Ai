/**
 * Porta de rate limiting (TASKS-AUTH §6).
 *
 * A interface é deliberadamente mínima para que o adapter possa ser trocado
 * (memória → Postgres → Redis) sem tocar nenhuma action ou caso de uso.
 */
export interface RateLimiterPort {
  /**
   * Consome uma unidade da cota de `chave`. `true` = pode seguir.
   *
   * Contrato: a chamada CONTA a tentativa. Chamar só para "consultar" também
   * consome — quem precisa apenas ler o estado não deve usar esta porta.
   */
  permitir(chave: string, limite: number, janelaMs: number): Promise<boolean>;
}
