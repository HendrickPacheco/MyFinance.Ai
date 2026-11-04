/**
 * Schema zod do fechamento de ciclo (`fecharCiclo`, `application/fechamento.ts`).
 * Único de propósito: a Server Action (`src/actions/ciclos.ts`) e a rota da
 * API do agente (`POST /ciclos/atual/fechar`) validam o MESMO objeto — se um
 * dia divergirem, o agente aceitaria (ou recusaria) um corpo que o wizard não
 * aceitaria, e vice-versa.
 */
import { z } from 'zod';

const CLASSE_PATRIMONIO = z.enum(['CONTA', 'RENDA_FIXA', 'RENDA_VARIAVEL', 'CRIPTO', 'IMOVEL', 'OUTRO']);

export const fechamentoSchema = z.object({
  rendaRealizadaCents: z.number().int().nonnegative(),
  novaMetaPoupancaCents: z.number().int().nonnegative().nullish(),
  snapshotData: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  snapshotItens: z
    .array(
      z.object({
        nome: z.string().min(1),
        classe: CLASSE_PATRIMONIO,
        valorCents: z.number().int(),
        // Quem valida se este id é do dono é `criarSnapshot`, no caso de uso.
        contaId: z.string().nullable().default(null),
      }),
    )
    .optional(),
  observacao: z.string().max(300).nullish(),
});

export type FechamentoInputBruto = z.input<typeof fechamentoSchema>;
