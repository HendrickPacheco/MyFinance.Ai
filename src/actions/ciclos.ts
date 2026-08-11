'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import { recalcularCicloAtual as ucRecalcular, puxarDaReserva as ucPuxarDaReserva } from '@/application/ciclos';
import { fecharCiclo as ucFechar, type ResultadoFechamento } from '@/application/fechamento';
import type { Ciclo } from '@/domain/model/entidades';
import type { ClassePatrimonio } from '@/domain/model/enums';

export async function recalcularCicloAtual(): Promise<Resultado<Ciclo>> {
  return executar(async () => {
    const deps = await criarDeps();
    const c = await ucRecalcular(deps);
    for (const p of ['/', '/ciclo']) revalidatePath(p);
    // O banner e a barra de totais de /custos mostram a verba do ciclo — e
    // recalcular é exatamente a ação que a muda. `'layout'` porque a barra vive
    // no layout compartilhado das três abas.
    revalidatePath('/custos', 'layout');
    return c;
  });
}

/**
 * Modo recuperação, saída (b) (SPEC 5.4): puxa X da reserva para a conta
 * variável e reduz a meta de poupança em X SÓ neste ciclo (aumenta a verba).
 * A decisão fica registrada na observação do ciclo — o padrão aparece no fechamento.
 */
export async function puxarDaReserva(valorCents: number): Promise<Resultado<Ciclo>> {
  return executar(async () => {
    const deps = await criarDeps();
    const c = await ucPuxarDaReserva(deps, valorCents);
    for (const p of ['/', '/ciclo']) revalidatePath(p);
    return c;
  });
}

const CLASSE = z.enum(['CONTA', 'RENDA_FIXA', 'RENDA_VARIAVEL', 'CRIPTO', 'IMOVEL', 'OUTRO']);

const fechamentoSchema = z.object({
  rendaRealizadaCents: z.number().int().nonnegative(),
  novaMetaPoupancaCents: z.number().int().nonnegative().nullish(),
  snapshotData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  snapshotItens: z
    .array(
      z.object({
        nome: z.string().min(1),
        classe: CLASSE,
        valorCents: z.number().int(),
        // Quem valida se este id é do dono é `criarSnapshot`, no caso de uso.
        contaId: z.string().nullable().default(null),
      }),
    )
    .optional(),
  observacao: z.string().max(300).nullish(),
});

export async function fecharCiclo(
  cicloId: string,
  input: z.input<typeof fechamentoSchema>,
): Promise<Resultado<ResultadoFechamento>> {
  return executar(async () => {
    const dados = fechamentoSchema.parse(input);
    const deps = await criarDeps();
    const r = await ucFechar(deps, cicloId, {
      rendaRealizadaCents: dados.rendaRealizadaCents,
      novaMetaPoupancaCents: dados.novaMetaPoupancaCents ?? null,
      snapshotData: dados.snapshotData,
      snapshotItens: dados.snapshotItens as
        | { nome: string; classe: ClassePatrimonio; valorCents: number; contaId: string | null }[]
        | undefined,
      observacao: dados.observacao ?? null,
    });
    for (const p of ['/', '/ciclo', '/analise', '/patrimonio', '/fechar-ciclo']) revalidatePath(p);
    return r;
  });
}
