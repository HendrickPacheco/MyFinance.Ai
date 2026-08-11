/**
 * Casos de uso da persistência de conversas do copiloto (Fase 2 do plano de
 * persistência). A Fase 1 entregou a porta e o adapter; este arquivo é a
 * única fronteira entre eles e as server actions — nenhuma action toca
 * `deps.conversas` diretamente (mesmo padrão de `application/memoria.ts`).
 *
 * Conversa é OWNER-only, pelo mesmo motivo de `application/memoria.ts`
 * (decisão D-12, 04/08/2026): é transcrição de pergunta sobre a vida
 * financeira do dono, mais sensível que os números que o VIEWER já vê. Por
 * isso `exigirOwner` — nunca `exigirEscrita` — é a PRIMEIRA linha de toda
 * função aqui, inclusive as de leitura.
 */
import type { Deps } from '@/application/deps';
import { exigirOwner } from '@/domain/auth/permissoes';
import { derivarTituloConversa } from '@/domain/ia/titulo-conversa';
import type { Conversa, Proveniencia } from '@/domain/model/entidades';
import type { ConversaComMensagens } from '@/domain/ports/conversa';
import type { MensagemIA } from '@/domain/ports/ia';

/** `conversaId` não existe OU pertence a outro dono — as actions traduzem em erro legível. */
export class ConversaNaoEncontradaError extends Error {
  constructor(id: string) {
    super(`Conversa ${id} não encontrada.`);
    this.name = 'ConversaNaoEncontradaError';
  }
}

/** Conversas do dono, mais recentemente atualizada primeiro. */
export async function listarConversas(deps: Deps): Promise<Conversa[]> {
  exigirOwner(deps.ator);
  return deps.conversas.listar();
}

/** Uma conversa com as mensagens. `null` se não existir ou não for do dono. */
export async function abrirConversa(deps: Deps, id: string): Promise<ConversaComMensagens | null> {
  exigirOwner(deps.ator);
  return deps.conversas.obterComMensagens(id);
}

export async function renomearConversa(deps: Deps, id: string, titulo: string): Promise<void> {
  exigirOwner(deps.ator);
  await deps.conversas.renomear(id, titulo);
}

export async function excluirConversa(deps: Deps, id: string): Promise<void> {
  exigirOwner(deps.ator);
  await deps.conversas.excluir(id);
}

/**
 * Valida que `id` é uma conversa do dono ANTES de qualquer chamada ao
 * provedor de IA (`perguntarCopiloto`) — um `conversaId` de outro usuário (ou
 * inexistente) tem que falhar aqui, e não depois de já ter pago um turno.
 */
export async function obterConversaDoDono(deps: Deps, id: string): Promise<Conversa> {
  exigirOwner(deps.ator);
  const existente = await deps.conversas.obterComMensagens(id);
  if (!existente) throw new ConversaNaoEncontradaError(id);
  return existente.conversa;
}

/**
 * Cria a conversa que abre com `pergunta`, título derivado dela (sem custo
 * de IA). Deliberadamente separada de `obterConversaDoDono`: o chamador só
 * invoca isto DEPOIS do provedor responder com sucesso — assim uma pergunta
 * que falhou não deixa nem o registro vazio da conversa no banco.
 */
export async function criarConversa(deps: Deps, pergunta: string): Promise<Conversa> {
  exigirOwner(deps.ator);
  return deps.conversas.criar(derivarTituloConversa(pergunta));
}

/** Uma mensagem persistida, traduzida para o papel que `MensagemIA` aceita. */
function paraMensagemIA(mensagem: { papel: 'usuario' | 'assistente'; conteudo: string }): MensagemIA {
  return mensagem.papel === 'usuario'
    ? { papel: 'usuario', conteudo: mensagem.conteudo }
    : { papel: 'assistente', conteudo: mensagem.conteudo };
}

/**
 * Janela de histórico para reenviar ao provedor de IA — as `limite`
 * mensagens mais recentes da conversa, na ordem que `responder()` espera.
 *
 * Só `conteudo` atravessa esta função. Proveniência NUNCA entra aqui: ela é
 * exclusiva da UI, e mandá-la ao modelo quebraria o contrato de segurança
 * descrito em `src/actions/ia.ts` (o modelo passaria a "ver" as próprias
 * ferramentas já resolvidas como texto, em vez de precisar chamá-las).
 */
export async function historicoDaConversa(
  deps: Deps,
  conversaId: string,
  limite: number,
): Promise<MensagemIA[]> {
  exigirOwner(deps.ator);
  const mensagens = await deps.conversas.ultimasMensagens(conversaId, limite);
  return mensagens.map(paraMensagemIA);
}

export interface NovoTurnoIA {
  pergunta: string;
  resposta: string;
  proveniencia: Proveniencia | null;
}

/**
 * Persiste o turno (pergunta + resposta) só depois do sucesso da IA — o
 * chamador (`perguntarCopiloto`) nunca invoca isto antes de `responder()`
 * já ter respondido, senão uma pergunta que falhou (teto de IA, provedor
 * fora, limite de turnos) ficaria gravada sem resposta correspondente.
 */
export async function registrarTurno(deps: Deps, conversaId: string, turno: NovoTurnoIA): Promise<void> {
  exigirOwner(deps.ator);
  await deps.conversas.anexarTurno(conversaId, turno);
}
