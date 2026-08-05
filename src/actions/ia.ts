'use server';

/**
 * Server action do copiloto (D4). Só orquestra: valida a entrada, monta as
 * dependências e chama o caso de uso. Nenhuma regra de cálculo aqui
 * (CLAUDE.md regra 4), e nenhuma exceção vaza para a UI (SPEC 8).
 *
 * NÃO chama `revalidatePath`: o copiloto é read-only e nada no banco mudou.
 * Revalidar aqui recarregaria as telas à toa a cada pergunta.
 *
 * ─── DEFESA DE CUSTO ───
 *
 * Os limites abaixo são a principal proteção contra conta inesperada de API.
 * O modelo custa por token de ENTRADA, e a entrada cresce com o histórico: sem
 * teto, uma conversa longa reenvia tudo a cada turno e o custo vira quadrático.
 * Por isso o histórico é cortado nos turnos mais RECENTES — são os que dão
 * contexto útil — e cada mensagem tem tamanho máximo.
 *
 * A outra metade da defesa é o limite de turnos dentro do loop (MAX_TURNOS em
 * application/ia/copiloto.ts), e o fato de nenhuma chamada de IA acontecer em
 * render de página: só por ação explícita do usuário.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { criarDeps } from '@/composition';
import { executar, type Resultado } from './resultado';
import { responder, type RespostaCopiloto } from '@/application/ia/copiloto';
import { propostaSchema, type Proposta } from '@/application/ia/propostas';
import { criarParcelamento, criarTransacao } from '@/application/transacoes';
import { salvarMemoria } from '@/application/memoria';
import type { MensagemIA } from '@/domain/ports/ia';

/** Uma pergunta longa demais é quase sempre texto colado por engano. */
const MAX_CARACTERES_PERGUNTA = 1000;
/** Teto por mensagem do histórico, para uma resposta antiga não inchar a entrada. */
const MAX_CARACTERES_MENSAGEM = 4000;
/** Turnos de histórico mantidos, os mais recentes. */
const MAX_MENSAGENS_HISTORICO = 20;

const mensagemSchema = z.discriminatedUnion('papel', [
  z.object({ papel: z.literal('usuario'), conteudo: z.string().max(MAX_CARACTERES_MENSAGEM) }),
  z.object({ papel: z.literal('assistente'), conteudo: z.string().max(MAX_CARACTERES_MENSAGEM) }),
]);

const entradaSchema = z.object({
  pergunta: z
    .string()
    .trim()
    .min(1, 'Escreva uma pergunta.')
    .max(MAX_CARACTERES_PERGUNTA, `Pergunta longa demais (máximo ${MAX_CARACTERES_PERGUNTA} caracteres).`),
  historico: z.array(mensagemSchema).default([]),
});

/**
 * Só `usuario` e `assistente` entram pelo histórico da UI. Turnos de
 * ferramenta são reconstruídos pelo loop a cada pergunta — aceitar `ferramenta`
 * daqui deixaria o cliente forjar o resultado de uma ferramenta e, com ele,
 * o número que o modelo vai narrar.
 */
export type MensagemHistorico = z.infer<typeof mensagemSchema>;

export async function perguntarCopiloto(entrada: {
  pergunta: string;
  historico?: readonly MensagemHistorico[];
}): Promise<Resultado<RespostaCopiloto>> {
  return executar(async () => {
    const validado = entradaSchema.parse({
      pergunta: entrada.pergunta,
      historico: entrada.historico ?? [],
    });

    // Corta pelos mais recentes: são os que dão contexto útil.
    const historico: MensagemIA[] = validado.historico.slice(-MAX_MENSAGENS_HISTORICO);

    return responder(await criarDeps(), { pergunta: validado.pergunta, historico });
  });
}

/**
 * Executa uma proposta que o dono confirmou na tela (decisão D-8).
 *
 * ─── POR QUE ESTA ACTION É SEGURA ───
 *
 * A proposta viaja até o navegador e volta, então o payload que chega aqui é
 * ENTRADA NÃO CONFIÁVEL, como qualquer outro. A segurança não vem de ele ter
 * saído do copiloto; vem de três coisas:
 *
 *  1. `propostaSchema.parse` — o payload é revalidado do zero. Centavos
 *     continuam sendo `Int`, data continua sendo "YYYY-MM-DD".
 *  2. Os casos de uso chamados são os MESMOS das telas: `criarTransacao`,
 *     `criarParcelamento` e `salvarMemoria` já fazem `exigirEscrita`/
 *     `exigirOwner` na primeira linha, guarda de ciclo fechado, efeito de
 *     saldo e a guarda pura da memória. Não existe caminho paralelo.
 *  3. Os repositórios já nascem escopados por `donoId` em `criarDeps()`, então
 *     um id de categoria ou conta de outro usuário não resolve.
 *
 * Ou seja: confirmar uma proposta forjada não consegue nada que o dono já não
 * pudesse fazer pelo formulário da tela — e ele veria o valor antes de clicar.
 *
 * `revalidatePath` aqui, ao contrário de `perguntarCopiloto`: isto GRAVA, e as
 * telas de teto e de ciclo ficariam mostrando o número velho.
 */
export async function confirmarProposta(proposta: Proposta): Promise<Resultado<void>> {
  return executar(async () => {
    const validada = propostaSchema.parse(proposta);
    const deps = await criarDeps();

    switch (validada.tipo) {
      case 'LANCAMENTO':
        await criarTransacao(deps, {
          valorCents: validada.valorCents,
          descricao: validada.descricao,
          data: validada.data ?? undefined,
          categoriaId: validada.categoriaId,
          contaId: validada.contaId,
          metodo: validada.metodo,
          tipo: 'DESPESA',
        });
        break;

      case 'PARCELAMENTO':
        await criarParcelamento(deps, {
          descricao: validada.descricao,
          valorTotalCents: validada.valorTotalCents,
          numParcelas: validada.numParcelas,
          dataCompra: validada.dataCompra ?? undefined,
          categoriaId: validada.categoriaId,
          metodo: validada.metodo,
        });
        break;

      case 'MEMORIA':
        await salvarMemoria(deps, {
          tipo: validada.tipoMemoria,
          texto: validada.texto,
          // Proposta do copiloto que o dono confirmou — a distinção existe
          // para a tela de auditoria mostrar de onde cada memória veio.
          origem: 'COPILOTO',
        });
        break;
    }

    // Memória não muda nenhum número de tela; lançamento e parcelamento mudam
    // teto, ciclo e painel. Revalidar a raiz cobre os três.
    if (validada.tipo !== 'MEMORIA') revalidatePath('/', 'layout');
  });
}
