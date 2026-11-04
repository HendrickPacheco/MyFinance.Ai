/**
 * Schemas zod das rotas `app/api/agent/v1/transacoes/**` e
 * `app/api/agent/v1/parcelamentos/**`. Exportados separadamente das rotas
 * (Next.js recusa export extra num `route.ts`) para serem reusados pela
 * própria rota E pela doc OpenAPI (`src/agent-api/openapi/transacoes.ts`) —
 * a doc nunca pode divergir da validação de verdade.
 *
 * O corpo de criação/edição de transação e parcelamento REUSA os schemas de
 * `src/application/transacoes-schemas.ts` (os mesmos que as Server Actions
 * validam) — regra de negócio nunca duplicada entre a Action e a API.
 */
import { z } from 'zod';
import { TIPO_TRANSACAO, METODO_PAGAMENTO } from '@/domain/model/enums';
import {
  transacaoInputSchema,
  parcelamentoInputSchema,
  patchParcelamentoSchema,
  estornoInputSchema,
} from '@/application/transacoes-schemas';
import { dataCivilSchema, paginacaoSchema } from '@/agent-api';

export const ORIGEM_TRANSACAO_AGENTE = ['MANUAL', 'IMPORTACAO'] as const;

export const idParamSchema = z.object({ id: z.string().min(1) });

export const parcelaParamSchema = z.object({
  id: z.string().min(1),
  transacaoId: z.string().min(1),
});

// ── Transações ──────────────────────────────────────────────────────────

export const transacaoBodySchema = transacaoInputSchema;

export const listarTransacoesQuerySchema = z
  .object({
    de: dataCivilSchema.optional(),
    ate: dataCivilSchema.optional(),
    tipo: z.enum(TIPO_TRANSACAO).optional(),
    metodo: z.enum(METODO_PAGAMENTO).optional(),
    categoriaId: z.string().optional(),
    contaId: z.string().optional(),
    cicloId: z.string().optional(),
    texto: z.string().optional(),
    valorMin: z.coerce.number().int().optional(),
    valorMax: z.coerce.number().int().optional(),
    parcelamentoId: z.string().optional(),
    origem: z.enum(ORIGEM_TRANSACAO_AGENTE).optional(),
    ordem: z.enum(['data', 'valor']).optional().default('data'),
    direcao: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .merge(paginacaoSchema);

export const estornarBodySchema = estornoInputSchema;

/** `DELETE /transacoes/{id}` aceita corpo vazio ou `{ confirmarRetroativo }`. */
export const excluirTransacaoBodySchema = z.object({
  confirmarRetroativo: z.boolean().optional(),
});

export const loteTransacoesSchema = z.object({
  confirmarRetroativo: z.boolean().optional(),
  transacoes: z.array(transacaoBodySchema).min(1).max(100),
});

// ── Parcelamentos ───────────────────────────────────────────────────────

export const criarParcelamentoBodySchema = parcelamentoInputSchema;
export const editarParcelamentoBodySchema = patchParcelamentoSchema.extend({
  confirmarRetroativo: z.boolean().optional(),
});

export const encerrarParcelamentoBodySchema = z.object({
  confirmarRetroativo: z.boolean().optional(),
});

/** Corpo vazio aceito — `pagar`/desmarcar não carrega campo nenhum, mas o kernel sempre faz `body.parse({})`. */
export const corpoVazioSchema = z.object({});
