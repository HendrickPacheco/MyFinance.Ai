/**
 * Schemas zod compartilhados da importação de fatura — usados tanto pelas
 * server actions (`src/actions/importacao.ts`) quanto pela API do agente
 * (`src/agent-api/schemas/importacao-admin.ts`). Viver num único lugar
 * garante que os dois caminhos de entrada (dono pela UI, agente pelo token)
 * aceitam exatamente a mesma forma de ajuste/escolha ambígua — divergir aqui
 * seria a API aceitar algo que a UI recusa, ou vice-versa.
 */
import { z } from 'zod';

/** "YYYY-MM" — competência da fatura, sempre informada por quem importa. */
export const competenciaRefSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Competência precisa estar em YYYY-MM.');

export const idNaoVazioSchema = z.string().min(1);

export const ajustesConfirmacaoSchema = z
  .object({
    categoriaId: idNaoVazioSchema.nullable().optional(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data precisa estar em YYYY-MM-DD.').optional(),
    descricao: z.string().trim().min(1).optional(),
    contaId: idNaoVazioSchema.nullable().optional(),
  })
  .optional();

export const escolhaAmbiguaSchema = z
  .union([
    z.object({ transacaoId: idNaoVazioSchema }),
    z.object({ semCandidato: z.literal(true) }),
  ])
  .optional();
