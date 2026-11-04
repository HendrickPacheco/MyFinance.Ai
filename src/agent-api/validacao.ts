/**
 * Schemas zod reutilizáveis para query string de rotas do agente. Query
 * string só tem valores `string` — `z.coerce`/`z.enum` fazem a conversão.
 */
import { z } from 'zod';

/** "YYYY-MM-DD" — nunca `z.coerce.date()` (regra 2: data civil é string, nunca `Date`). */
export const dataCivilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data civil precisa estar em "YYYY-MM-DD".');

/** Query string manda `"true"`/`"false"` como texto — nunca um `Boolean` nativo. */
export const booleanDeQuerySchema = z
  .enum(['true', 'false'])
  .transform((valor) => valor === 'true');

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 200;

/** Paginação por cursor — `limite` tem default 50 e teto 200 (SPEC do kernel). */
export const paginacaoSchema = z.object({
  cursor: z.string().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).optional().default(LIMITE_PADRAO),
});

export type Paginacao = z.infer<typeof paginacaoSchema>;

/**
 * `URLSearchParams` -> objeto plano, para alimentar `schema.parse(...)`.
 * Só a última ocorrência de uma chave repetida sobrevive — nenhuma rota do
 * agente usa parâmetro repetido (lista vai no corpo, não na query).
 */
export function objetoDaQuery(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams);
}
