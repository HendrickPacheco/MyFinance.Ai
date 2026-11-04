/**
 * Schemas zod do grupo "ciclos" da API do agente. Toda rota em
 * `app/api/agent/v1/{ciclos,contexto,gastos-por-categoria,tendencias,
 * assinaturas,analise-corte,para-onde-vai-a-renda,projecao,simular}/**`
 * valida contra os objetos daqui — o `openapi/ciclos.ts` documenta os MESMOS
 * objetos, nunca uma cópia.
 */
import { z } from 'zod';
import { dataCivilSchema, LIMITE_MAXIMO, LIMITE_PADRAO } from '@/agent-api/validacao';
export { fechamentoSchema } from '@/application/fechamento-schemas';

/** Teto do motor de projeção (`projetarCiclos`/`RangeError` acima disso — ver `MAX_CICLOS` em `application/projecao.ts`). */
const MAX_HORIZONTE_CICLOS = 60;

export const paramsCicloIdSchema = z.object({ id: z.string().min(1) });

export const queryListaCiclosSchema = z.object({
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).optional().default(LIMITE_PADRAO),
});

/** `?ids=a,b,c` — vazio depois do `trim`/filtro é tratado como "nenhum id", nunca como `['']`. */
const idsSeparadosPorVirgulaSchema = z
  .string()
  .min(1)
  .transform((valor) =>
    valor
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

export const queryCompararCiclosSchema = z.object({
  ids: idsSeparadosPorVirgulaSchema.optional(),
  ultimos: z.coerce.number().int().min(1).max(12).optional(),
});

export const queryGastosPorCategoriaSchema = z
  .object({
    cicloId: z.string().min(1).optional(),
    de: dataCivilSchema.optional(),
    ate: dataCivilSchema.optional(),
  })
  .superRefine((valor, ctx) => {
    const temDe = valor.de !== undefined;
    const temAte = valor.ate !== undefined;
    if (temDe !== temAte) {
      ctx.addIssue({ code: 'custom', message: '"de" e "ate" só valem informados juntos.' });
      return;
    }
    const temIntervalo = temDe && temAte;
    const temCiclo = valor.cicloId !== undefined;
    if (temCiclo === temIntervalo) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe "cicloId" OU "de"+"ate" — nunca os dois, nunca nenhum.',
      });
    }
  })
  // Validado acima: exatamente uma das duas formas chegou aqui. O cast
  // declara essa garantia ao tipo de saída sem reintroduzir `undefined`.
  .transform((valor): { cicloId: string } | { de: string; ate: string } =>
    valor.cicloId !== undefined
      ? { cicloId: valor.cicloId }
      : { de: valor.de as string, ate: valor.ate as string },
  );

export const queryTendenciasSchema = z.object({
  categoriaId: z.string().min(1),
  ultimos: z.coerce.number().int().min(1).max(24).optional(),
});

export const queryNumCiclosOpcionalSchema = z.object({
  numCiclos: z.coerce.number().int().min(1).max(MAX_HORIZONTE_CICLOS).optional(),
});

export const queryLimiteOpcionalSchema = z.object({
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).optional(),
});

export const queryProjecaoSchema = z.object({
  ciclos: z.coerce.number().int().min(1).max(MAX_HORIZONTE_CICLOS).optional().default(6),
});

export const bodySimularCompraParceladaSchema = z.object({
  descricao: z.string().min(1),
  valorTotalCents: z.number().int().positive(),
  numParcelas: z.number().int().min(1),
  dataCompra: dataCivilSchema.optional(),
  numCiclos: z.number().int().min(1).max(MAX_HORIZONTE_CICLOS).optional(),
});

export const bodySimularMetaPrazoSchema = z.object({
  alvoCents: z.number().int().positive(),
  dataLimite: dataCivilSchema,
});

export const bodySimularRendaSchema = z.object({
  rendaHipoteticaCents: z.number().int().nonnegative(),
  numCiclos: z.number().int().min(1).max(MAX_HORIZONTE_CICLOS).optional(),
});
