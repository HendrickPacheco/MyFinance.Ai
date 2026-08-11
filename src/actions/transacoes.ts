'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import { executarComConfirmacao, type ResultadoRetroativo } from './resultado-retroativo';
import {
  criarTransacao as ucCriar,
  criarParcelamento as ucParcelar,
  editarTransacao as ucEditar,
  excluirTransacao as ucExcluir,
  estornarTransacao as ucEstornar,
} from '@/application/transacoes';
import type { Transacao } from '@/domain/model/entidades';

export type { ResultadoRetroativo } from './resultado-retroativo';

const TIPO = z.enum(['DESPESA', 'RENDA', 'TRANSFERENCIA', 'ESTORNO']);
const METODO = z.enum(['PIX', 'DEBITO', 'CREDITO', 'DINHEIRO', 'BOLETO']);
const dataCivil = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD')
  .optional();

const transacaoSchema = z.object({
  valorCents: z.number().int().positive('Informe um valor maior que zero.'),
  categoriaId: z.string().nullish(),
  tipo: TIPO.optional(),
  data: dataCivil,
  descricao: z.string().max(200).nullish(),
  metodo: METODO.nullish(),
  contaId: z.string().nullish(),
  contaDestinoId: z.string().nullish(),
  provisaoId: z.string().nullish(),
  confirmarRetroativo: z.boolean().optional(),
});

const parcelamentoSchema = z.object({
  descricao: z.string().min(1, 'Descreva a compra.'),
  valorTotalCents: z.number().int().positive(),
  numParcelas: z.number().int().min(2, 'Parcelamento tem no mínimo 2 parcelas.').max(72),
  dataCompra: dataCivil,
  categoriaId: z.string().nullish(),
  contaId: z.string().nullish(),
  metodo: METODO.nullish(),
});

/**
 * Toda rota que exibe o MESMO dinheiro precisa ser invalidada junto — senão a
 * tela vizinha continua mostrando o número anterior, sem erro nenhum.
 *
 * `revalidatePath('/custos', 'layout')` (e não a rota nua) porque a barra de
 * totais de `/custos` mora no LAYOUT: sem o segundo argumento ela fica
 * desatualizada enquanto a aba abaixo dela já mostra o valor novo. Aprendizado
 * da Fase 7 do TASKS-CUSTOS. Como `layout` cobre as três abas, `/custos/*` não
 * precisa ser listado item a item.
 */
function revalidarTudo(): void {
  for (const p of ['/', '/ciclo', '/analise', '/fechar-ciclo']) revalidatePath(p);
  revalidatePath('/custos', 'layout');
}

export async function criarTransacao(
  input: z.input<typeof transacaoSchema>,
): Promise<Resultado<Transacao>> {
  return executar(async () => {
    const dados = transacaoSchema.parse(input);
    const deps = await criarDeps();
    const t = await ucCriar(deps, dados);
    revalidarTudo();
    return t;
  });
}

export async function criarParcelamento(
  input: z.input<typeof parcelamentoSchema>,
): Promise<Resultado<Transacao[]>> {
  return executar(async () => {
    const dados = parcelamentoSchema.parse(input);
    const deps = await criarDeps();
    const parcelas = await ucParcelar(deps, dados);
    revalidarTudo();
    return parcelas;
  });
}

export async function editarTransacao(
  id: string,
  input: z.input<typeof transacaoSchema>,
): Promise<ResultadoRetroativo<Transacao>> {
  return executarComConfirmacao(async () => {
    const dados = transacaoSchema.parse(input);
    const deps = await criarDeps();
    const t = await ucEditar(deps, id, dados);
    revalidarTudo();
    return t;
  });
}

export async function excluirTransacao(
  id: string,
  confirmarRetroativo = false,
): Promise<ResultadoRetroativo> {
  return executarComConfirmacao(async () => {
    const deps = await criarDeps();
    await ucExcluir(deps, id, confirmarRetroativo);
    revalidarTudo();
  });
}

export async function estornarTransacao(
  id: string,
  valorCents?: number,
  data?: string,
  confirmarRetroativo = false,
): Promise<ResultadoRetroativo<Transacao>> {
  return executarComConfirmacao(async () => {
    const deps = await criarDeps();
    const t = await ucEstornar(deps, id, valorCents, data, confirmarRetroativo);
    revalidarTudo();
    return t;
  });
}
