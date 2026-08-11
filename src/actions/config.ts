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
import {
  desativarCustoFixo as ucDesativarCusto,
  reativarCustoFixo as ucReativarCusto,
  excluirCustoFixo as ucExcluirCusto,
  desativarProvisao as ucDesativarProvisao,
  reativarProvisao as ucReativarProvisao,
  excluirProvisao as ucExcluirProvisao,
} from '@/application/custos';
import {
  criarSnapshot as ucSnapshot,
  aceitarRealidade as ucAceitarRealidade,
} from '@/application/patrimonio';
import type {
  ResultadoUpsertCustoFixo,
  ResultadoUpsertProvisao,
} from '@/application/config';
import type { EfeitoNoCicloAtual } from '@/application/ciclos';
import type { Categoria, Conta } from '@/domain/model/entidades';

/** Data civil "YYYY-MM-DD" (regra 2 do CLAUDE.md — nunca DateTime). */
const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');

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
  pisoDiarioVerbaCents: z.number().int().positive().default(1500),
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
      pisoDiarioVerbaCents: d.pisoDiarioVerbaCents,
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

const custoSchema = z
  .object({
    id: z.string().default(''),
    nome: z.string().min(1),
    valorCents: z.number().int().nonnegative(),
    diaVencimento: z.number().int().min(1).max(31),
    ativo: z.boolean().default(true),
    contaId: z.string().nullish(),
    // Vigência: hints de projeção futura. Ausente = custo constante, que é como
    // todos os custos existentes se comportam — o campo não muda nada até ser
    // preenchido de propósito.
    vigenteDe: dataCivil.nullish(),
    vigenteAte: dataCivil.nullish(),
  })
  // Data civil "YYYY-MM-DD" compara lexicograficamente (regra 2 do
  // CLAUDE.md) — nunca `new Date(...)` para isto. Sem esta validação,
  // `vigenteAte` anterior a `vigenteDe` some da projeção pra sempre, em
  // silêncio: nenhum ciclo futuro nasceria dentro de uma janela vazia.
  .refine((c) => !c.vigenteDe || !c.vigenteAte || c.vigenteDe <= c.vigenteAte, {
    message: 'A data de término da vigência não pode ser anterior ao início.',
    path: ['vigenteAte'],
  });

/**
 * Devolve o cadastro salvo E `efeito`: o que aconteceu com o ciclo em curso.
 * A UI escolhe a frase a partir dele — "vale a partir de 01/09" ou "a verba de
 * agosto passou de X para Y" (TASKS-CUSTOS §4.3 item 0). Sem esse campo, a
 * única frase possível seria a que às vezes é mentira.
 */
export async function upsertCustoFixo(
  input: z.input<typeof custoSchema>,
): Promise<Resultado<ResultadoUpsertCustoFixo>> {
  return executar(async () => {
    const d = custoSchema.parse(input);
    const deps = await criarDeps();
    const r = await ucCusto(deps, {
      ...d,
      contaId: d.contaId ?? null,
      vigenteDe: d.vigenteDe ?? null,
      vigenteAte: d.vigenteAte ?? null,
    });
    revalidarRotasDeCustos();
    return r;
  });
}

const idSchema = z.object({ id: z.string().min(1) });

/**
 * Revalida as rotas que exibem custos fixos/provisões. `'layout'` em `/custos`
 * é obrigatório e não é detalhe: as três abas são sub-rotas reais e a barra de
 * totais vive no layout compartilhado — revalidar só o path exato deixaria a
 * barra (fixos, provisão, verba livre) exibindo o número de antes da edição.
 */
function revalidarRotasDeCustos(): void {
  revalidatePath('/config');
  revalidatePath('/');
  revalidatePath('/custos', 'layout');
}

export async function desativarCustoFixo(
  input: z.input<typeof idSchema>,
): Promise<Resultado<EfeitoNoCicloAtual>> {
  return executar(async () => {
    const d = idSchema.parse(input);
    const deps = await criarDeps();
    const efeito = await ucDesativarCusto(deps, d.id);
    revalidarRotasDeCustos();
    return efeito;
  });
}

export async function reativarCustoFixo(
  input: z.input<typeof idSchema>,
): Promise<Resultado<EfeitoNoCicloAtual>> {
  return executar(async () => {
    const d = idSchema.parse(input);
    const deps = await criarDeps();
    const efeito = await ucReativarCusto(deps, d.id);
    revalidarRotasDeCustos();
    return efeito;
  });
}

export async function excluirCustoFixo(
  input: z.input<typeof idSchema>,
): Promise<Resultado<EfeitoNoCicloAtual>> {
  return executar(async () => {
    const d = idSchema.parse(input);
    const deps = await criarDeps();
    const efeito = await ucExcluirCusto(deps, d.id);
    revalidarRotasDeCustos();
    return efeito;
  });
}

export async function desativarProvisao(
  input: z.input<typeof idSchema>,
): Promise<Resultado<EfeitoNoCicloAtual>> {
  return executar(async () => {
    const d = idSchema.parse(input);
    const deps = await criarDeps();
    const efeito = await ucDesativarProvisao(deps, d.id);
    revalidarRotasDeCustos();
    return efeito;
  });
}

export async function reativarProvisao(
  input: z.input<typeof idSchema>,
): Promise<Resultado<EfeitoNoCicloAtual>> {
  return executar(async () => {
    const d = idSchema.parse(input);
    const deps = await criarDeps();
    const efeito = await ucReativarProvisao(deps, d.id);
    revalidarRotasDeCustos();
    return efeito;
  });
}

export async function excluirProvisao(
  input: z.input<typeof idSchema>,
): Promise<Resultado<EfeitoNoCicloAtual>> {
  return executar(async () => {
    const d = idSchema.parse(input);
    const deps = await criarDeps();
    const efeito = await ucExcluirProvisao(deps, d.id);
    revalidarRotasDeCustos();
    return efeito;
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
): Promise<Resultado<ResultadoUpsertProvisao>> {
  return executar(async () => {
    const d = provisaoSchema.parse(input);
    const deps = await criarDeps();
    const r = await ucProvisao(deps, { ...d, mesEsperado: d.mesEsperado ?? null });
    revalidarRotasDeCustos();
    return r;
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
      // Aceito do cliente, mas quem decide se este id é seu é `criarSnapshot`
      // no caso de uso — schema valida forma, não propriedade.
      contaId: z.string().nullable().default(null),
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

/**
 * Aceita a realidade observada num item conciliado, movendo o saldo da conta
 * até o valor fotografado. Revalida `/` e `/ciclo` também: saldo de conta
 * aparece nos painéis, não só na tela de patrimônio.
 */
export async function aceitarRealidade(itemId: string): Promise<Resultado> {
  return executar(async () => {
    const id = z.string().min(1).parse(itemId);
    const deps = await criarDeps();
    await ucAceitarRealidade(deps, id);
    for (const p of ['/patrimonio', '/', '/config']) revalidatePath(p);
  });
}
