/**
 * Schemas zod de validação de transação/parcelamento — ponto único de verdade
 * das regras de entrada, reusado por `src/actions/transacoes.ts`,
 * `src/actions/parcelamentos.ts` e pelas rotas `app/api/agent/v1/transacoes/**`
 * / `app/api/agent/v1/parcelamentos/**`. Mover regra duplicada para aqui é o
 * que impede a Server Action e a rota do agente divergirem silenciosamente
 * sobre o que é um `valorCents` válido.
 */
import { z } from 'zod';
import { TIPO_TRANSACAO, METODO_PAGAMENTO } from '@/domain/model/enums';

/** "YYYY-MM-DD" opcional — nunca `z.coerce.date()` (CLAUDE.md regra 2). */
export const dataCivilOpcionalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD')
  .optional();

export const transacaoInputSchema = z.object({
  valorCents: z.number().int().positive('Informe um valor maior que zero.'),
  categoriaId: z.string().nullish(),
  tipo: z.enum(TIPO_TRANSACAO).optional(),
  data: dataCivilOpcionalSchema,
  descricao: z.string().max(200).nullish(),
  metodo: z.enum(METODO_PAGAMENTO).nullish(),
  contaId: z.string().nullish(),
  contaDestinoId: z.string().nullish(),
  provisaoId: z.string().nullish(),
  tipoVerbaOverride: z.enum(['DIA_A_DIA', 'EXTRA']).nullish(),
  confirmarRetroativo: z.boolean().optional(),
});
export type TransacaoInputSchema = z.infer<typeof transacaoInputSchema>;

export const parcelamentoInputSchema = z.object({
  descricao: z.string().min(1, 'Descreva a compra.'),
  valorTotalCents: z.number().int().positive(),
  numParcelas: z.number().int().min(2, 'Parcelamento tem no mínimo 2 parcelas.').max(72),
  dataCompra: dataCivilOpcionalSchema,
  categoriaId: z.string().nullish(),
  contaId: z.string().nullish(),
  metodo: z.enum(METODO_PAGAMENTO).nullish(),
});
export type ParcelamentoInputSchema = z.infer<typeof parcelamentoInputSchema>;

export const patchParcelamentoSchema = z.object({
  descricao: z.string().min(1, 'Descreva a compra.').optional(),
  categoriaId: z.string().nullish(),
  metodo: z.enum(METODO_PAGAMENTO).nullish(),
  valorTotalCents: z.number().int().positive('Informe um valor maior que zero.').optional(),
  numParcelas: z.number().int().min(2, 'Parcelamento tem no mínimo 2 parcelas.').max(72).optional(),
  dataCompra: dataCivilOpcionalSchema,
});
export type PatchParcelamentoSchema = z.infer<typeof patchParcelamentoSchema>;

export const estornoInputSchema = z.object({
  valorCents: z.number().int().positive().optional(),
  data: dataCivilOpcionalSchema,
  confirmarRetroativo: z.boolean().optional(),
});
export type EstornoInputSchema = z.infer<typeof estornoInputSchema>;
