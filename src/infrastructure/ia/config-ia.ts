/**
 * ÚNICO lugar do repositório que lê as variáveis de ambiente da camada de IA.
 * Nem o domínio nem os casos de uso conhecem `OPENAI_*` — o adapter resolve
 * credencial e modelo e injeta o resto por porta.
 *
 * Falha explícita e legível quando falta configuração: `undefined` nunca chega
 * ao SDK.
 */

export interface ConfigIA {
  apiKey: string;
  /** Id do modelo. Mora no `.env`, nunca no código. */
  modelo: string;
  timeoutMs: number;
  maxTentativas: number;
}

/** Defaults conservadores: o app é pessoal e a conta de API é do dono. */
const TIMEOUT_MS_PADRAO = 60_000;
const MAX_TENTATIVAS_PADRAO = 2;

/**
 * Liga/desliga a camada inteira. Default `false` por conservadorismo
 * operacional — não ligar a camada antes de ela estar pronta.
 */
export function iaHabilitada(): boolean {
  return process.env.IA_HABILITADA === 'true';
}

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (valor == null || valor.trim() === '') {
    throw new Error(`${nome} não configurado — preencha no .env`);
  }
  return valor.trim();
}

function inteiroPositivoOpcional(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (bruto == null || bruto.trim() === '') return padrao;

  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`${nome} inválido: "${bruto}" — use um inteiro positivo`);
  }
  return valor;
}

/**
 * Lê a configuração do provedor. Só deve ser chamada quando `iaHabilitada()`
 * é verdadeira — com a camada desligada não há nada para configurar.
 */
export function lerConfigIA(): ConfigIA {
  return {
    apiKey: obrigatoria('OPENAI_API_KEY'),
    modelo: obrigatoria('OPENAI_MODEL'),
    timeoutMs: inteiroPositivoOpcional('IA_TIMEOUT_MS', TIMEOUT_MS_PADRAO),
    maxTentativas: inteiroPositivoOpcional('IA_MAX_TENTATIVAS', MAX_TENTATIVAS_PADRAO),
  };
}

// ─── Embeddings (Fase E) ────────────────────────────────────────────────────

export interface ConfigEmbedding extends ConfigIA {
  /** Precisa casar com a coluna `vector(N)` da tabela `Memoria`. */
  dimensoes: number;
}

/**
 * 1536 é a dimensão de `text-embedding-3-small` e a declarada na migração
 * `20260804210000_memoria_copiloto`. Mudar aqui sem migrar a coluna faz o
 * Postgres recusar toda gravação de memória.
 */
const DIMENSOES_EMBEDDING_PADRAO = 1536;

/**
 * A memória degrada em vez de quebrar quando não há modelo de embedding
 * configurado: sem `OPENAI_MODEL_EMBEDDING` a busca semântica não existe, mas
 * gravar, listar e arquivar memória continuam funcionando. Por isso este
 * `null`, e não uma exceção como em `lerConfigIA`.
 */
export function embeddingHabilitado(): boolean {
  const modelo = process.env.OPENAI_MODEL_EMBEDDING;
  return iaHabilitada() && modelo != null && modelo.trim() !== '';
}

export function lerConfigEmbedding(): ConfigEmbedding {
  return {
    apiKey: obrigatoria('OPENAI_API_KEY'),
    modelo: obrigatoria('OPENAI_MODEL_EMBEDDING'),
    dimensoes: inteiroPositivoOpcional('OPENAI_EMBEDDING_DIMENSOES', DIMENSOES_EMBEDDING_PADRAO),
    timeoutMs: inteiroPositivoOpcional('IA_TIMEOUT_MS', TIMEOUT_MS_PADRAO),
    maxTentativas: inteiroPositivoOpcional('IA_MAX_TENTATIVAS', MAX_TENTATIVAS_PADRAO),
  };
}
