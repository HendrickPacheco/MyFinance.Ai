'use server';

/**
 * Server actions da importação de fatura (I3, onda 3 — `TASKS-IMPORTACAO.md`).
 * Só orquestram: validam a entrada com Zod, montam `Deps` e chamam o caso de
 * uso (CLAUDE.md regra 4). Nenhuma exceção vaza para a UI (SPEC 8, mesmo
 * padrão de `src/actions/resultado.ts`).
 *
 * O payload que chega aqui — inclusive `importacaoId`/`itemId` — é ENTRADA
 * NÃO CONFIÁVEL, como qualquer outra vinda do cliente (ver o comentário de
 * `confirmarProposta` em `src/actions/ia.ts:189-211`): revalidamos do zero
 * com Zod, e a segurança real vem dos casos de uso chamados — eles já fazem
 * `exigirEscrita`/`exigirOwner` na própria primeira linha, e os repositórios
 * nascem escopados por `donoId` em `criarDeps()`.
 *
 * D-18 (25/08/2026, §15.7): toda linha que vira lançamento é confirmada
 * INDIVIDUALMENTE — por isso não existe aqui nenhuma action de "confirmar em
 * bloco". `confirmarItemImportadoAction` recebe sempre UM item.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import { hashDoTexto, normalizarTextoDeFatura } from '@/infrastructure/importacao/texto-fatura';
import {
  conciliarImportacao,
  type ResultadoImportacaoConciliada,
} from '@/application/importacao/conciliar';
import {
  confirmarItemImportado,
  descartarItemImportado,
  finalizarImportacao,
  type ResultadoConfirmacao,
  type ResultadoFinalizacao,
} from '@/application/importacao/confirmar';
import {
  desfazerImportacao,
  type ResultadoDesfazerImportacao,
} from '@/application/importacao/desfazer';

/** "YYYY-MM" — competência da fatura, sempre informada pelo dono. */
const competenciaRefSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Competência precisa estar em YYYY-MM.');

/** Um texto colado maior que isto é quase sempre um documento errado, não uma fatura. */
const MAX_CARACTERES_TEXTO_COLADO = 500_000;

const colarTextoSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'Cole o texto da fatura.')
    .max(MAX_CARACTERES_TEXTO_COLADO, 'Texto colado longo demais.'),
  competenciaRef: competenciaRefSchema,
});

/**
 * Atalho barato: o dono cola o texto da fatura direto (sem passar pelo
 * upload de PDF em `/api/importacao`). `conciliarImportacao` cuida de
 * normalizar, gerar o hash de idempotência e extrair via IA.
 */
export async function colarTextoImportacaoAction(
  entrada: unknown,
): Promise<Resultado<ResultadoImportacaoConciliada>> {
  return executar(async () => {
    const validado = colarTextoSchema.parse(entrada);
    const deps = await criarDeps();

    // Mesma normalização e hash de identidade que a rota de upload de PDF
    // aplica (`app/api/importacao/route.ts`) — texto colado e texto extraído
    // de um PDF do MESMO documento precisam produzir o mesmo hash para a
    // idempotência de `conciliarImportacao` funcionar entre os dois caminhos.
    const textoNormalizado = normalizarTextoDeFatura(validado.texto);
    const hashConteudo = hashDoTexto(textoNormalizado);

    return conciliarImportacao(deps, {
      texto: textoNormalizado,
      hashConteudo,
      competenciaRef: validado.competenciaRef,
      origem: 'TEXTO_COLADO',
      nomeArquivo: null,
    });
  });
}

const idNaoVazioSchema = z.string().min(1);

const ajustesConfirmacaoSchema = z
  .object({
    categoriaId: idNaoVazioSchema.nullable().optional(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data precisa estar em YYYY-MM-DD.').optional(),
    descricao: z.string().trim().min(1).optional(),
    contaId: idNaoVazioSchema.nullable().optional(),
  })
  .optional();

const escolhaAmbiguaSchema = z
  .union([
    z.object({ transacaoId: idNaoVazioSchema }),
    z.object({ semCandidato: z.literal(true) }),
  ])
  .optional();

const confirmarItemSchema = z.object({
  importacaoId: idNaoVazioSchema,
  itemId: idNaoVazioSchema,
  ajustes: ajustesConfirmacaoSchema,
  confirmarRetroativo: z.boolean().optional(),
  escolhaAmbigua: escolhaAmbiguaSchema,
});

/**
 * Confirma UMA linha da importação (D-18: nunca em bloco). Dependendo do
 * veredito já calculado, o caso de uso grava uma `Transacao`, um
 * `Parcelamento`, marca um custo fixo como pago, ou só resolve a linha sem
 * gravar nada — em qualquer um desses casos o estado financeiro pode ter
 * mudado, então revalidamos as telas que dependem dele.
 */
export async function confirmarItemImportadoAction(
  entrada: unknown,
): Promise<Resultado<ResultadoConfirmacao>> {
  return executar(async () => {
    const validado = confirmarItemSchema.parse(entrada);
    const deps = await criarDeps();

    const resultado = await confirmarItemImportado(deps, validado);
    revalidatePath('/');
    revalidatePath('/ciclo');
    return resultado;
  });
}

const itemDaImportacaoSchema = z.object({
  importacaoId: idNaoVazioSchema,
  itemId: idNaoVazioSchema,
});

/**
 * Descarta uma linha sem gravar nada — ação explícita do dono, distinta do
 * veredito `IGNORAR` que a conciliação já decide sozinha. Não grava
 * `Transacao`/`Parcelamento`/pagamento de custo fixo, então não há tela
 * financeira para revalidar.
 */
export async function descartarItemImportadoAction(entrada: unknown): Promise<Resultado<void>> {
  return executar(async () => {
    const validado = itemDaImportacaoSchema.parse(entrada);
    const deps = await criarDeps();
    await descartarItemImportado(deps, validado);
  });
}

const finalizarImportacaoSchema = z.object({
  importacaoId: idNaoVazioSchema,
});

/**
 * Marca o rascunho como `CONFIRMADA` quando não sobra nenhuma linha
 * `PENDENTE`. Não força nada: com pendências, devolve a contagem em vez de
 * lançar, e a UI decide como avisar o dono.
 */
export async function finalizarImportacaoAction(
  entrada: unknown,
): Promise<Resultado<ResultadoFinalizacao>> {
  return executar(async () => {
    const validado = finalizarImportacaoSchema.parse(entrada);
    const deps = await criarDeps();
    return finalizarImportacao(deps, validado.importacaoId);
  });
}

const desfazerImportacaoSchema = z.object({
  importacaoId: idNaoVazioSchema,
  confirmarRetroativo: z.boolean().optional(),
});

/**
 * Desfaz uma importação inteira (I4 — "importei a fatura errada"): cada
 * linha `GRAVADA`/`APROVADA` é revertida pelo caminho que a criou
 * (`excluirTransacao`, exclusão do parcelamento completo, ou
 * `desmarcarCustoFixoPago`), e a importação é marcada `DESCARTADA`. Pode
 * mudar saldo de conta, acumulado de provisão e sobra de ciclo fechado — as
 * mesmas telas que `confirmarItemImportadoAction` revalida.
 */
export async function desfazerImportacaoAction(
  entrada: unknown,
): Promise<Resultado<ResultadoDesfazerImportacao>> {
  return executar(async () => {
    const validado = desfazerImportacaoSchema.parse(entrada);
    const deps = await criarDeps();

    const resultado = await desfazerImportacao(
      deps,
      validado.importacaoId,
      validado.confirmarRetroativo ?? false,
    );
    revalidatePath('/');
    revalidatePath('/ciclo');
    return resultado;
  });
}
