'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import { recalcularCicloAtual as ucRecalcular, puxarDaReserva as ucPuxarDaReserva } from '@/application/ciclos';
import {
  fecharCiclo as ucFechar,
  previaPoupancaReal,
  type ResultadoFechamento,
  type ResumoFechamento,
  type PreviaPoupancaReal,
} from '@/application/fechamento';
import {
  previaRecalculoRenda,
  recalcularRendaDoCiclo,
  previaConfirmacaoRendaReal,
  confirmarRendaReal,
  type ImpactoRenda,
  type PreviaConfirmacaoRenda,
} from '@/application/renda-ciclo';
import { parseTaxaMicros } from '@/shared/dinheiro';
import { fechamentoSchema } from '@/application/fechamento-schemas';
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
      poupancaRealManualCents: dados.poupancaRealManualCents ?? null,
    });
    for (const p of ['/', '/ciclo', '/analise', '/patrimonio', '/fechar-ciclo']) revalidatePath(p);
    return r;
  });
}

/** Prévia da poupança real com o snapshot do fim ainda não gravado (passo de poupança do wizard). */
export async function previaPoupancaRealAction(
  cicloId: string,
  snapshotData: string,
  snapshotTotalCents: number,
): Promise<Resultado<PreviaPoupancaReal>> {
  return executar(async () => {
    const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(snapshotData);
    const totalCents = z.number().int().parse(snapshotTotalCents);
    return previaPoupancaReal(await criarDeps(), cicloId, { data, totalCents });
  });
}

// ------------------------------------------------------------ renda do ciclo
// Os erros do caso de uso (RendaJaConfirmadaError, CicloFechadoError,
// RangeError) já carregam mensagem para o dono; `executar` as repassa.

function revalidarRenda() {
  for (const p of ['/', '/ciclo']) revalidatePath(p);
}

export async function previaRecalculoRendaAction(): Promise<Resultado<ImpactoRenda>> {
  return executar(async () => previaRecalculoRenda(await criarDeps()));
}

export async function recalcularRendaAction(): Promise<Resultado<Ciclo>> {
  return executar(async () => {
    const c = await recalcularRendaDoCiclo(await criarDeps());
    revalidarRenda();
    return c;
  });
}

const cents = z.number().int().nonnegative().optional();
const rendaRealSchema = z.object({
  brutaOrigemCents: cents,
  // Texto digitado ("5,43"): vira micros aqui, na fronteira, sem float.
  taxa: z
    .string()
    .optional()
    .transform((t) => (t?.trim() ? parseTaxaMicros(t) : undefined))
    .pipe(z.number().int().nonnegative().optional()),
  impostoCents: cents,
  liquidaCents: cents,
  gerarLancamento: z.boolean(),
});
export type RendaRealEntrada = z.input<typeof rendaRealSchema>;

function lerRendaReal(input: RendaRealEntrada) {
  const { taxa, ...resto } = rendaRealSchema.parse(input);
  return { ...resto, taxaMicros: taxa };
}

export async function previaRendaRealAction(
  cicloId: string,
  input: RendaRealEntrada,
): Promise<Resultado<PreviaConfirmacaoRenda>> {
  return executar(async () => previaConfirmacaoRendaReal(await criarDeps(), cicloId, lerRendaReal(input)));
}

export async function confirmarRendaRealAction(
  cicloId: string,
  input: RendaRealEntrada,
): Promise<Resultado<Ciclo>> {
  return executar(async () => {
    const c = await confirmarRendaReal(await criarDeps(), cicloId, lerRendaReal(input));
    revalidarRenda();
    return c;
  });
}
