'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import {
  atualizarConfig as ucConfig,
  upsertConta as ucConta,
  upsertCustoFixo as ucCusto,
  upsertProvisao as ucProvisao,
  upsertCategoria as ucCategoria,
} from '@/application/config';
import { criarSnapshot as ucSnapshot } from '@/application/patrimonio';
import type { Categoria, Conta, CustoFixo, ProvisaoAnual } from '@/domain/model/entidades';

const configSchema = z.object({
  rendaBaseCents: z.number().int().nonnegative(),
  rendaVariavel: z.boolean(),
  diaRecebimento: z.number().int().min(1).max(31),
  metaPoupancaCents: z.number().int().nonnegative(),
  metaPoupancaPercent: z.number().min(0).max(100).nullish(),
  moeda: z.string().default('BRL'),
  timezone: z.string().default('America/Bahia'),
  destinoSobra: z.enum(['RESERVA', 'INVESTIMENTO', 'ROLLOVER']),
  destinoSobraContaId: z.string().nullish(),
});

export async function atualizarConfig(
  input: z.input<typeof configSchema>,
): Promise<Resultado> {
  return executar(async () => {
    const d = configSchema.parse(input);
    const deps = await criarDeps();
    await ucConfig(deps, {
      rendaBaseCents: d.rendaBaseCents,
      rendaVariavel: d.rendaVariavel,
      diaRecebimento: d.diaRecebimento,
      metaPoupancaCents: d.metaPoupancaCents,
      metaPoupancaPercent: d.metaPoupancaPercent ?? null,
      moeda: d.moeda,
      timezone: d.timezone,
      destinoSobra: d.destinoSobra,
      destinoSobraContaId: d.destinoSobraContaId ?? null,
    });
    revalidatePath('/config');
    revalidatePath('/');
  });
}

const contaSchema = z.object({
  id: z.string().default(''),
  nome: z.string().min(1),
  tipo: z.enum(['FIXOS', 'VARIAVEL', 'RESERVA', 'INVESTIMENTO']),
  saldoCents: z.number().int().default(0),
  incluiPatrimonio: z.boolean().default(true),
  arquivada: z.boolean().default(false),
});

export async function upsertConta(input: z.input<typeof contaSchema>): Promise<Resultado<Conta>> {
  return executar(async () => {
    const d = contaSchema.parse(input);
    const deps = await criarDeps();
    const c = await ucConta(deps, d);
    revalidatePath('/config');
    return c;
  });
}

const custoSchema = z.object({
  id: z.string().default(''),
  nome: z.string().min(1),
  valorCents: z.number().int().nonnegative(),
  diaVencimento: z.number().int().min(1).max(31),
  ativo: z.boolean().default(true),
  contaId: z.string().nullish(),
});

export async function upsertCustoFixo(
  input: z.input<typeof custoSchema>,
): Promise<Resultado<CustoFixo>> {
  return executar(async () => {
    const d = custoSchema.parse(input);
    const deps = await criarDeps();
    const c = await ucCusto(deps, { ...d, contaId: d.contaId ?? null });
    revalidatePath('/config');
    return c;
  });
}

const provisaoSchema = z.object({
  id: z.string().default(''),
  nome: z.string().min(1),
  valorAnualCents: z.number().int().nonnegative(),
  mesEsperado: z.number().int().min(1).max(12).nullish(),
  acumuladoCents: z.number().int().default(0),
  ativo: z.boolean().default(true),
});

export async function upsertProvisao(
  input: z.input<typeof provisaoSchema>,
): Promise<Resultado<ProvisaoAnual>> {
  return executar(async () => {
    const d = provisaoSchema.parse(input);
    const deps = await criarDeps();
    const p = await ucProvisao(deps, { ...d, mesEsperado: d.mesEsperado ?? null });
    revalidatePath('/config');
    return p;
  });
}

const categoriaSchema = z.object({
  id: z.string().default(''),
  nome: z.string().min(1),
  grupo: z.enum(['VARIAVEL', 'FIXO', 'RENDA']),
  essencial: z.boolean().default(false),
  icone: z.string().nullish(),
  cor: z.string().nullish(),
  ordem: z.number().int().default(0),
});

export async function upsertCategoria(
  input: z.input<typeof categoriaSchema>,
): Promise<Resultado<Categoria>> {
  return executar(async () => {
    const d = categoriaSchema.parse(input);
    const deps = await criarDeps();
    const c = await ucCategoria(deps, {
      ...d,
      icone: d.icone ?? null,
      cor: d.cor ?? null,
    });
    revalidatePath('/config');
    return c;
  });
}

const snapshotSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  itens: z.array(
    z.object({
      nome: z.string().min(1),
      classe: z.enum(['CONTA', 'RENDA_FIXA', 'RENDA_VARIAVEL', 'CRIPTO', 'IMOVEL', 'OUTRO']),
      valorCents: z.number().int(),
    }),
  ),
});

export async function criarSnapshot(input: z.input<typeof snapshotSchema>): Promise<Resultado> {
  return executar(async () => {
    const d = snapshotSchema.parse(input);
    const deps = await criarDeps();
    await ucSnapshot(deps, d.data, d.itens);
    revalidatePath('/patrimonio');
  });
}
