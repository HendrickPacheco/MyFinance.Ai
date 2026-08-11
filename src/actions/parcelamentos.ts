'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import { executarComConfirmacao, type ResultadoRetroativo } from './resultado-retroativo';
import {
  listarParcelamentos as ucListar,
  encerrarParcelamento as ucEncerrar,
  editarParcelamento as ucEditar,
  previaEncerramentoParcelamento as ucPrevia,
  type ParcelamentoResumo,
  type PreviaEncerramento,
  type ResultadoEncerramentoParcelamento,
} from '@/application/parcelamentos';
import { METODO_PAGAMENTO } from '@/domain/model/enums';
import type { Parcelamento } from '@/domain/model/entidades';

export type { ResultadoRetroativo } from './resultado-retroativo';

const dataCivil = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD')
  .optional();

const patchParcelamentoSchema = z.object({
  descricao: z.string().min(1, 'Descreva a compra.').optional(),
  categoriaId: z.string().nullish(),
  metodo: z.enum(METODO_PAGAMENTO).nullish(),
  valorTotalCents: z.number().int().positive('Informe um valor maior que zero.').optional(),
  numParcelas: z.number().int().min(2, 'Parcelamento tem no mínimo 2 parcelas.').max(72).optional(),
  dataCompra: dataCivil,
});

/**
 * Toda tela que soma parcelas (§5.1 ticket 4).
 *
 * `/analise` e `/fechar-ciclo` estavam faltando — `actions/transacoes.ts` já
 * as revalida, e cancelar parcelas apaga `Transacao` exatamente como excluir
 * um gasto: sem elas a análise do ciclo e a tela de fechamento continuavam
 * mostrando parcelas que não existem mais.
 *
 * `/custos` precisa de `'layout'`: a barra de totais vive no layout da seção,
 * não na página, e revalidar só a rota deixaria o total desatualizado ao lado
 * da lista já atualizada (aprendizado da Fase 7).
 */
function revalidarTudo(): void {
  for (const p of ['/', '/ciclo', '/analise', '/fechar-ciclo']) revalidatePath(p);
  revalidatePath('/custos', 'layout');
}

export async function listarParcelamentos(): Promise<Resultado<ParcelamentoResumo[]>> {
  return executar(async () => {
    const deps = await criarDeps();
    return ucListar(deps);
  });
}

/**
 * Os números do diálogo de encerramento ANTES de agir (§4.2). Leitura pura:
 * nada aqui escreve, e por isso não revalida rota nenhuma.
 */
export async function previaEncerramento(id: string): Promise<Resultado<PreviaEncerramento>> {
  return executar(async () => {
    const deps = await criarDeps();
    return ucPrevia(deps, id);
  });
}

export async function encerrarParcelamento(
  id: string,
  confirmarRetroativo = false,
): Promise<ResultadoRetroativo<ResultadoEncerramentoParcelamento>> {
  return executarComConfirmacao(async () => {
    const deps = await criarDeps();
    const resultado = await ucEncerrar(deps, id, confirmarRetroativo);
    revalidarTudo();
    return resultado;
  });
}

export async function editarParcelamento(
  id: string,
  input: z.input<typeof patchParcelamentoSchema>,
  confirmarRetroativo = false,
): Promise<ResultadoRetroativo<Parcelamento>> {
  return executarComConfirmacao(async () => {
    const dados = patchParcelamentoSchema.parse(input);
    const deps = await criarDeps();
    const parcelamento = await ucEditar(deps, id, dados, confirmarRetroativo);
    revalidarTudo();
    return parcelamento;
  });
}
