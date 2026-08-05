/**
 * Porta de embeddings (Fase E, tarefa E4). Separada de `ProvedorIAPort` de
 * propósito: são dois modelos diferentes, com custos diferentes, e um pode
 * estar disponível sem o outro. Um fake de chat não deve arrastar um fake de
 * embedding junto.
 *
 * 🔴 Isto GASTA DINHEIRO REAL, então é uma entrada nova de IA e obedece ao
 * mesmo contrato de três passos de `application/limite-ia.ts` (§10.2 item 3):
 * OWNER-only, teto avaliado antes, consumo registrado depois. Por isso o
 * retorno carrega `consumo` — sem ele, o teto diário teria um furo por onde
 * passa toda gravação de memória.
 */
import type { ConsumoTokens } from './ia';

export interface ResultadoEmbedding {
  /** O vetor. A dimensão é do modelo; a porta não a fixa. */
  vetor: readonly number[];
  /** Ausente se o provedor não informar. */
  consumo?: ConsumoTokens;
}

export interface EmbeddingPort {
  /**
   * Vetoriza um texto. Lança `ErroProvedorIA` — nunca deixa vazar erro do SDK.
   *
   * O chamador trata a falha como DEGRADAÇÃO, não como erro fatal: memória
   * sem vetor continua sendo gravada e continua visível na tela de auditoria;
   * ela só não é alcançada pela busca semântica.
   */
  gerar(texto: string): Promise<ResultadoEmbedding>;

  /** Dimensão do vetor produzido — o adapter de persistência precisa conferir. */
  readonly dimensoes: number;
}
