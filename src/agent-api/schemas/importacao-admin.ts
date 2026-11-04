/**
 * Schemas zod das rotas `app/api/agent/v1/{importacao,auditoria}/**`.
 * Reaproveita os schemas de ajuste/escolha ambígua/competência de
 * `@/application/importacao/schemas` — os MESMOS que `src/actions/importacao.ts`
 * usa — para a API do agente nunca aceitar algo que a UI recusaria.
 */
import { z } from 'zod';
import {
  ajustesConfirmacaoSchema,
  competenciaRefSchema,
  escolhaAmbiguaSchema,
  idNaoVazioSchema,
} from '@/application/importacao/schemas';
import { paginacaoSchema } from '@/agent-api/validacao';

/** Um texto colado maior que isto é quase sempre um documento errado, não uma fatura (mesmo teto de `actions/importacao.ts`). */
const MAX_CARACTERES_TEXTO_COLADO = 500_000;

/**
 * `{ texto }` (colagem direta, barata) OU `{ pdfBase64, nomeArquivo? }`
 * (upload do PDF cru, em base64 — a rota decodifica e extrai o texto). As
 * duas formas exigem `competenciaRef` ("YYYY-MM"): sem ela a conciliação não
 * sabe em qual janela buscar transações/ciclos existentes para casar contra.
 */
export const criarImportacaoBodySchema = z.union([
  z.object({
    texto: z.string().trim().min(1, 'Cole o texto da fatura.').max(MAX_CARACTERES_TEXTO_COLADO),
    competenciaRef: competenciaRefSchema,
  }),
  z.object({
    pdfBase64: z.string().min(1, 'Envie o PDF em base64.'),
    competenciaRef: competenciaRefSchema,
    nomeArquivo: z.string().trim().min(1).optional(),
  }),
]);
export type CriarImportacaoBody = z.infer<typeof criarImportacaoBodySchema>;

export const importacaoIdParamsSchema = z.object({ id: idNaoVazioSchema });
export type ImportacaoIdParams = z.infer<typeof importacaoIdParamsSchema>;

const aprovarItemSchema = z.object({
  itemId: idNaoVazioSchema,
  ajustes: ajustesConfirmacaoSchema,
  confirmarRetroativo: z.boolean().optional(),
  escolhaAmbigua: escolhaAmbiguaSchema,
});

/**
 * Lote de decisões de uma importação. `refine` recusa um corpo vazio (nada
 * para fazer) e um `itemId` presente nos dois lados — aprovar e descartar a
 * MESMA linha no mesmo lote é uma instrução contraditória, e decidir
 * silenciosamente qual delas "vence" seria pior que recusar.
 */
export const aprovarImportacaoBodySchema = z
  .object({
    itens: z.array(aprovarItemSchema).default([]),
    descartar: z.array(idNaoVazioSchema).default([]),
    finalizar: z.boolean().optional(),
  })
  .refine(
    (corpo) => corpo.itens.length > 0 || corpo.descartar.length > 0 || corpo.finalizar === true,
    { message: 'Informe ao menos um item para aprovar/descartar, ou finalizar: true.' },
  )
  .refine(
    (corpo) => {
      const aprovados = new Set(corpo.itens.map((item) => item.itemId));
      return !corpo.descartar.some((itemId) => aprovados.has(itemId));
    },
    { message: 'Um mesmo itemId não pode aparecer em "itens" e em "descartar" no mesmo lote.' },
  );
export type AprovarImportacaoBody = z.infer<typeof aprovarImportacaoBodySchema>;

export const desfazerImportacaoBodySchema = z.object({
  confirmarRetroativo: z.boolean().optional(),
});
export type DesfazerImportacaoBody = z.infer<typeof desfazerImportacaoBodySchema>;

/** `de`/`ate` filtram o instante de `criadoEm` — datetime ISO completo, não data civil (não é "dia", é o carimbo exato do log). */
export const auditoriaQuerySchema = paginacaoSchema.extend({
  de: z.string().datetime().optional(),
  ate: z.string().datetime().optional(),
  entidade: z.string().min(1).optional(),
  acao: z.enum(['CREATE', 'UPDATE', 'DELETE', 'ACTION']).optional(),
  tokenId: z.string().min(1).optional(),
  dryRun: z.enum(['true', 'false']).optional(),
});
export type AuditoriaQuery = z.infer<typeof auditoriaQuerySchema>;
