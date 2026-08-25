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
import {
  abrirConversa,
  criarConversa,
  excluirConversa,
  historicoDaConversa,
  listarConversas,
  obterConversaDoDono,
  registrarTurno,
  renomearConversa,
} from '@/application/ia/conversas';
import type { Deps } from '@/application/deps';
import { propostaSchema, type Proposta } from '@/application/ia/propostas';
import { criarParcelamento, criarTransacao } from '@/application/transacoes';
import { salvarMemoria } from '@/application/memoria';
import type { Conversa, MensagemConversa, Proveniencia } from '@/domain/model/entidades';

/** Uma pergunta longa demais é quase sempre texto colado por engano. */
const MAX_CARACTERES_PERGUNTA = 1000;
/**
 * Turnos de histórico reenviados ao provedor. Agora que o histórico vem do
 * banco (Fase 2), este teto ainda é a defesa de custo — a entrada cresce com
 * o histórico, e sem corte uma conversa longa reenviaria tudo a cada turno.
 */
const MAX_MENSAGENS_HISTORICO = 20;

const entradaSchema = z.object({
  /** `null` = criar conversa nova a partir desta pergunta. */
  conversaId: z.string().min(1).nullable(),
  pergunta: z
    .string()
    .trim()
    .min(1, 'Escreva uma pergunta.')
    .max(MAX_CARACTERES_PERGUNTA, `Pergunta longa demais (máximo ${MAX_CARACTERES_PERGUNTA} caracteres).`),
});

export interface RespostaCopilotoComConversa {
  /** Id da conversa usada — a mesma que veio na entrada, ou a recém-criada. */
  conversaId: string;
  resposta: RespostaCopiloto;
}

/**
 * Traduz `RespostaCopiloto` (forma da aplicação) para `Proveniencia` (forma
 * do domínio, persistida). `null` quando não há nada para a UI reconstruir
 * depois de um reload — resposta de opinião pura, sem ferramenta, proposta
 * ou alerta.
 *
 * ─── FRONTEIRA DE SEGURANÇA ───
 * O objeto devolvido aqui SÓ viaja para `anexarTurno` (persistência, lido
 * de volta pela UI). Ele nunca entra em `historicoDaConversa`, que manda ao
 * provedor apenas `conteudo` das mensagens. Se algum dia este objeto for
 * serializado de volta para dentro de uma `MensagemIA`, o modelo passaria a
 * "ver" ferramentas já resolvidas como texto plano, sem precisar chamá-las —
 * exatamente o que a proveniência existe para não fazer.
 */
function montarProveniencia(resposta: RespostaCopiloto): Proveniencia | null {
  const semNadaAGuardar =
    resposta.ferramentasUsadas.length === 0 &&
    resposta.valoresCitados.length === 0 &&
    resposta.valoresInformados.length === 0 &&
    resposta.valoresNaoRastreados.length === 0 &&
    resposta.propostas.length === 0 &&
    !resposta.incompleta;
  if (semNadaAGuardar) return null;

  return {
    ferramentasUsadas: resposta.ferramentasUsadas.map((f) => ({
      nome: f.nome,
      argumentos: f.argumentos,
      comoFoiCalculado: f.comoFoiCalculado,
      falhou: f.falhou,
    })),
    valoresCitados: resposta.valoresCitados.map((v) => ({ ...v })),
    valoresInformados: [...resposta.valoresInformados],
    valoresNaoRastreados: [...resposta.valoresNaoRastreados],
    propostas: resposta.propostas.map((p) => ({
      // `Proposta` é um union discriminado, não um tipo com index signature —
      // o cast é seguro porque este campo nunca é revalidado a partir daqui;
      // quem grava (`confirmarProposta`) sempre refaz `propostaSchema.parse`
      // a partir do que a UI mandar de volta, nunca deste objeto persistido.
      proposta: p.proposta as unknown as Record<string, unknown>,
      resumo: p.resumo,
      detalhes: p.detalhes.map((d) => ({ ...d })),
    })),
    semFerramenta: resposta.semFerramenta,
    incompleta: resposta.incompleta,
  };
}

/**
 * Grava o turno só depois do sucesso do modelo — uma pergunta que o loop
 * derrubou (teto de IA, provedor fora, limite de turnos) fica órfã de
 * propósito, nunca meio-turno gravado no histórico.
 */
async function persistirTurno(
  deps: Deps,
  conversaId: string,
  pergunta: string,
  resposta: RespostaCopiloto,
): Promise<void> {
  await registrarTurno(deps, conversaId, {
    pergunta,
    resposta: resposta.texto,
    proveniencia: montarProveniencia(resposta),
  });
}

export async function perguntarCopiloto(entrada: {
  conversaId: string | null;
  pergunta: string;
}): Promise<Resultado<RespostaCopilotoComConversa>> {
  return executar(async () => {
    const validado = entradaSchema.parse(entrada);
    const deps = await criarDeps();

    if (validado.conversaId !== null) {
      // Validado ANTES de chamar o provedor: um id de outro dono (ou
      // inexistente) falha aqui, sem gastar nenhum turno de IA.
      const conversa = await obterConversaDoDono(deps, validado.conversaId);
      const historico = await historicoDaConversa(deps, conversa.id, MAX_MENSAGENS_HISTORICO);

      const resposta = await responder(deps, { pergunta: validado.pergunta, historico });
      await persistirTurno(deps, conversa.id, validado.pergunta, resposta);

      return { conversaId: conversa.id, resposta };
    }

    // Conversa nova: não há histórico para carregar, e ela só nasce no banco
    // DEPOIS do modelo responder — ver o comentário de `persistirTurno`.
    const resposta = await responder(deps, { pergunta: validado.pergunta, historico: [] });
    const conversa = await criarConversa(deps, validado.pergunta);
    await persistirTurno(deps, conversa.id, validado.pergunta, resposta);

    return { conversaId: conversa.id, resposta };
  });
}

export async function listarConversasIA(): Promise<Resultado<Conversa[]>> {
  return executar(async () => listarConversas(await criarDeps()));
}

export async function abrirConversaIA(
  id: string,
): Promise<Resultado<{ conversa: Conversa; mensagens: MensagemConversa[] } | null>> {
  return executar(async () => abrirConversa(await criarDeps(), id));
}

export async function renomearConversaIA(id: string, titulo: string): Promise<Resultado<void>> {
  return executar(async () => {
    await renomearConversa(await criarDeps(), id, titulo);
    revalidatePath('/copiloto');
  });
}

export async function excluirConversaIA(id: string): Promise<Resultado<void>> {
  return executar(async () => {
    await excluirConversa(await criarDeps(), id);
    revalidatePath('/copiloto');
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

      case 'IMPORTACAO':
        // 🔴 De propósito, esta action NUNCA grava uma proposta IMPORTACAO.
        // D-18 revista (`TASKS-IMPORTACAO.md` §15.7): a confirmação é POR
        // LINHA, nunca em bloco. Um clique único aqui gravaria as N linhas
        // de uma vez — exatamente o que a revisão do dono proibiu. Quem
        // grava é `confirmarItemImportado`
        // (`application/importacao/confirmar.ts`), chamado uma vez por
        // linha nova/ambígua a partir da tela de revisão — nunca esta
        // action. Lançar em vez de virar no-op silencioso: um botão que
        // parece confirmar e não faz nada é pior que um erro explícito.
        throw new Error(
          'Proposta de importação não é confirmada em bloco. Cada linha é confirmada individualmente — use a confirmação por linha na tela de revisão da fatura.',
        );
    }

    // Memória não muda nenhum número de tela; lançamento e parcelamento mudam
    // teto, ciclo e painel. Revalidar a raiz cobre os três.
    if (validada.tipo !== 'MEMORIA') revalidatePath('/', 'layout');
  });
}
