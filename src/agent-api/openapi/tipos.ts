/**
 * Descrição de um endpoint da API do agente para gerar o `openapi.json`.
 * Cada grupo de rotas exporta um `EndpointDoc[]` em `src/agent-api/openapi/<grupo>.ts`,
 * reutilizando os MESMOS schemas zod que a rota usa para validar — a doc não
 * pode divergir da validação.
 */
import type { ZodTypeAny } from 'zod';
import type { EscopoAgente } from '@/domain/auth/api-token';

export interface EndpointDoc {
  metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Caminho relativo a `/api/agent/v1`, com parâmetros no formato OpenAPI: `/transacoes/{id}`. */
  caminho: string;
  escopo: EscopoAgente;
  resumo: string;
  descricao?: string;
  /** Tag de agrupamento no OpenAPI (ex.: "Transações"). */
  tag: string;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  /** Rota de escrita: aceita `?dryRun=true` e `Idempotency-Key`. */
  escrita?: boolean;
}
