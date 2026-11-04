/**
 * Schemas zod do grupo "cadastros" da API do agente: categorias, contas,
 * custos fixos, provisões, config e patrimônio. Reaproveitados tanto pelas
 * rotas (`app/api/agent/v1/{categorias,contas,custos-fixos,provisoes,config,
 * patrimonio}/**`) quanto pelo OpenAPI (`openapi/cadastros.ts`) — a doc nunca
 * pode divergir da validação.
 *
 * Nenhum schema aqui usa `.default()`/`.transform()`/`z.coerce` nos campos
 * passados como `body`/`query` ao kernel (`rotaAgente`/`rotaEscrita`): o
 * kernel tipa esses parâmetros como `ZodType<Q>` — Input e Output iguais —, e
 * um schema cujo Input difere do Output (todo `.default()` cria exatamente
 * essa divergência: Input aceita `undefined`, Output não) quebra a inferência
 * de `Q`/`B` em erros de `tsc` só visíveis na ROTA que o usa, não aqui. Os
 * defaults de criação são aplicados à mão nas rotas (`?? valorPadrao`).
 *
 * Schemas de ATUALIZAÇÃO (PATCH) têm todo campo `.optional()` sem fallback —
 * um PATCH parcial omite o que não muda, e aplicar default a um campo
 * omitido sobrescreveria silenciosamente o valor atual do registro.
 */
import { z } from 'zod';
import { dataCivilSchema } from '@/agent-api';

export const paramsIdSchema = z.object({ id: z.string().min(1) });

export const grupoCategoriaSchema = z.enum(['VARIAVEL', 'FIXO', 'RENDA']);
export const tipoContaSchema = z.enum(['FIXOS', 'VARIAVEL', 'RESERVA', 'INVESTIMENTO']);
export const destinoSobraSchema = z.enum(['RESERVA', 'INVESTIMENTO', 'ROLLOVER']);
export const classePatrimonioSchema = z.enum([
  'CONTA',
  'RENDA_FIXA',
  'RENDA_VARIAVEL',
  'CRIPTO',
  'IMOVEL',
  'OUTRO',
]);

// ── Categoria ────────────────────────────────────────────────────────────

export const categoriaCriarSchema = z.object({
  nome: z.string().min(1),
  grupo: grupoCategoriaSchema,
  essencial: z.boolean().optional(),
  icone: z.string().nullish(),
  cor: z.string().nullish(),
  ordem: z.number().int().optional(),
});
export type CategoriaCriarInput = z.infer<typeof categoriaCriarSchema>;

export const categoriaAtualizarSchema = z.object({
  nome: z.string().min(1).optional(),
  grupo: grupoCategoriaSchema.optional(),
  essencial: z.boolean().optional(),
  icone: z.string().nullish(),
  cor: z.string().nullish(),
  ordem: z.number().int().optional(),
});
export type CategoriaAtualizarInput = z.infer<typeof categoriaAtualizarSchema>;

// ── Conta ────────────────────────────────────────────────────────────────

export const contaCriarSchema = z.object({
  nome: z.string().min(1),
  tipo: tipoContaSchema,
  saldoCents: z.number().int().optional(),
  incluiPatrimonio: z.boolean().optional(),
  arquivada: z.boolean().optional(),
});
export type ContaCriarInput = z.infer<typeof contaCriarSchema>;

/** `arquivada: true` é o caminho de "excluir" uma conta — não há DELETE (regra 1 do CLAUDE.md não se aplica aqui, mas a FK de histórico sim). */
export const contaAtualizarSchema = z.object({
  nome: z.string().min(1).optional(),
  tipo: tipoContaSchema.optional(),
  saldoCents: z.number().int().optional(),
  incluiPatrimonio: z.boolean().optional(),
  arquivada: z.boolean().optional(),
});
export type ContaAtualizarInput = z.infer<typeof contaAtualizarSchema>;

// ── Custo fixo ───────────────────────────────────────────────────────────

/** Data civil string — nunca `Date` (regra 2 do CLAUDE.md) — comparação lexicográfica. */
export function vigenciaValida(
  vigenteDe: string | null | undefined,
  vigenteAte: string | null | undefined,
): boolean {
  return !vigenteDe || !vigenteAte || vigenteDe <= vigenteAte;
}

const MENSAGEM_VIGENCIA_INVALIDA = 'A data de término da vigência não pode ser anterior ao início.';

export const custoFixoCriarSchema = z
  .object({
    nome: z.string().min(1),
    valorCents: z.number().int().nonnegative(),
    diaVencimento: z.number().int().min(1).max(31),
    ativo: z.boolean().optional(),
    contaId: z.string().nullish(),
    categoriaId: z.string().nullish(),
    vigenteDe: dataCivilSchema.nullish(),
    vigenteAte: dataCivilSchema.nullish(),
  })
  .refine((c) => vigenciaValida(c.vigenteDe, c.vigenteAte), {
    message: MENSAGEM_VIGENCIA_INVALIDA,
    path: ['vigenteAte'],
  });
export type CustoFixoCriarInput = z.infer<typeof custoFixoCriarSchema>;

export const custoFixoAtualizarSchema = z.object({
  nome: z.string().min(1).optional(),
  valorCents: z.number().int().nonnegative().optional(),
  diaVencimento: z.number().int().min(1).max(31).optional(),
  /** Alterna ativo/inativo no mesmo PATCH (equivalente a desativar/reativar). */
  ativo: z.boolean().optional(),
  contaId: z.string().nullish(),
  categoriaId: z.string().nullish(),
  vigenteDe: dataCivilSchema.nullish(),
  vigenteAte: dataCivilSchema.nullish(),
});
export type CustoFixoAtualizarInput = z.infer<typeof custoFixoAtualizarSchema>;

export { MENSAGEM_VIGENCIA_INVALIDA };

// ── Provisão anual ───────────────────────────────────────────────────────

export const provisaoCriarSchema = z.object({
  nome: z.string().min(1),
  valorAnualCents: z.number().int().nonnegative(),
  mesEsperado: z.number().int().min(1).max(12).nullish(),
  acumuladoCents: z.number().int().optional(),
  ativo: z.boolean().optional(),
});
export type ProvisaoCriarInput = z.infer<typeof provisaoCriarSchema>;

export const provisaoAtualizarSchema = z.object({
  nome: z.string().min(1).optional(),
  valorAnualCents: z.number().int().nonnegative().optional(),
  mesEsperado: z.number().int().min(1).max(12).nullish(),
  acumuladoCents: z.number().int().optional(),
  /** Alterna ativo/inativo no mesmo PATCH (equivalente a desativar/reativar). */
  ativo: z.boolean().optional(),
});
export type ProvisaoAtualizarInput = z.infer<typeof provisaoAtualizarSchema>;

// ── Config ───────────────────────────────────────────────────────────────

/**
 * PATCH parcial: só os campos enviados mudam. A rota funde isto com a Config
 * atual antes de chamar `atualizarConfig` — igual, em espírito, a toda outra
 * atualização parcial deste grupo.
 */
export const configAtualizarSchema = z.object({
  rendaBaseCents: z.number().int().nonnegative().optional(),
  rendaVariavel: z.boolean().optional(),
  diaRecebimento: z.number().int().min(1).max(31).optional(),
  metaPoupancaCents: z.number().int().nonnegative().optional(),
  metaPoupancaPercent: z.number().min(0).max(100).nullish(),
  moeda: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  destinoSobra: destinoSobraSchema.optional(),
  destinoSobraContaId: z.string().nullish(),
  pisoDiarioVerbaCents: z.number().int().positive().optional(),
});
export type ConfigAtualizarInput = z.infer<typeof configAtualizarSchema>;

// ── Patrimônio ───────────────────────────────────────────────────────────

export const patrimonioItemSchema = z.object({
  nome: z.string().min(1),
  classe: classePatrimonioSchema,
  valorCents: z.number().int(),
  contaId: z.string().nullish(),
});
export type PatrimonioItemInput = z.infer<typeof patrimonioItemSchema>;

export const patrimonioSnapshotCriarSchema = z.object({
  data: dataCivilSchema,
  itens: z.array(patrimonioItemSchema).min(1),
});
export type PatrimonioSnapshotCriarInput = z.infer<typeof patrimonioSnapshotCriarSchema>;

// ── Contas: query de listagem ─────────────────────────────────────────────

/**
 * NÃO usa `booleanDeQuerySchema` do kernel de propósito: ele é um
 * `.transform()` (Input `"true"|"false"`, Output `boolean`), e todo schema
 * com Input≠Output quebra a inferência de `ZodType<Q>` do kernel (mesma razão
 * do comentário no topo deste arquivo). Aqui o Input FICA como string — a
 * rota converte explicitamente.
 */
export const contasQuerySchema = z.object({
  incluirArquivadas: z.enum(['true', 'false']).optional(),
});
export type ContasQuery = z.infer<typeof contasQuerySchema>;
