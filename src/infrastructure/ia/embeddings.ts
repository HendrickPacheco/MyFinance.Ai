/**
 * Adapter de `EmbeddingPort` (Fase E, tarefa E4).
 *
 * Junto com `provedor-ia.ts`, um dos dois únicos arquivos que importam o SDK.
 * Traduz falha do SDK em `ErroProvedorIA` tipado, exatamente como o irmão —
 * o caso de uso trata a falha como degradação, mas precisa recebê-la tipada
 * para saber que foi o provedor, e não um bug de escrita no banco.
 *
 * A dimensão é declarada aqui e conferida contra o schema (`vector(1536)`).
 * Trocar `OPENAI_MODEL_EMBEDDING` por um modelo de outra dimensão sem migrar a
 * coluna produziria erro do Postgres a cada gravação; falhar na configuração é
 * mais barato que descobrir isso na primeira memória.
 */
import OpenAI from 'openai';
import { ErroProvedorIA } from '@/domain/ports/ia';
import type { EmbeddingPort, ResultadoEmbedding } from '@/domain/ports/embeddings';
import { lerConfigEmbedding, type ConfigEmbedding } from './config-ia';

export class EmbeddingOpenAI implements EmbeddingPort {
  readonly dimensoes: number;

  constructor(
    private readonly cliente: OpenAI,
    private readonly config: ConfigEmbedding,
  ) {
    this.dimensoes = config.dimensoes;
  }

  async gerar(texto: string): Promise<ResultadoEmbedding> {
    try {
      const resposta = await this.cliente.embeddings.create({
        model: this.config.modelo,
        input: texto,
        dimensions: this.config.dimensoes,
      });

      const vetor = resposta.data[0]?.embedding;
      if (!vetor) {
        throw new ErroProvedorIA('INDISPONIVEL', 'O provedor devolveu embedding vazio.');
      }
      if (vetor.length !== this.dimensoes) {
        // Nunca grave um vetor de dimensão errada: o Postgres recusaria, mas o
        // erro sairia como falha de escrita e mandaria investigar o lugar errado.
        throw new ErroProvedorIA(
          'SCHEMA_INVALIDO',
          `Embedding com ${vetor.length} dimensões, esperado ${this.dimensoes}. ` +
            'Confira OPENAI_MODEL_EMBEDDING e a coluna vector() da tabela Memoria.',
        );
      }

      return {
        vetor,
        // Embedding não tem token de saída — o custo é todo de entrada.
        consumo: resposta.usage
          ? { entrada: resposta.usage.prompt_tokens, saida: 0 }
          : undefined,
      };
    } catch (erro) {
      if (erro instanceof ErroProvedorIA) throw erro;
      if (erro instanceof OpenAI.APIError) {
        if (erro.status === 429) {
          throw new ErroProvedorIA('LIMITE_EXCEDIDO', 'Limite de uso da API excedido.', erro);
        }
        throw new ErroProvedorIA(
          'INDISPONIVEL',
          `Provedor de embeddings indisponível: ${erro.message}`,
          erro,
        );
      }
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      throw new ErroProvedorIA('INDISPONIVEL', `Falha ao gerar embedding: ${mensagem}`, erro);
    }
  }
}

/** Monta o adapter a partir do ambiente. Só o composition root chama isto. */
export function criarEmbeddingIA(): EmbeddingPort {
  const config = lerConfigEmbedding();
  const cliente = new OpenAI({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: Math.max(0, config.maxTentativas - 1),
  });
  return new EmbeddingOpenAI(cliente, config);
}
