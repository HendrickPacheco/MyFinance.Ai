/**
 * Porta da persistência de conversas do copiloto (Fase 1 do plano de
 * persistência — histórico deixa de viver só no `useState` da tela).
 *
 * O domínio não sabe que existe Prisma nem transação SQL — sabe apenas que dá
 * para criar uma conversa, listar as existentes, ler uma com as mensagens, e
 * anexar um turno (pergunta + resposta) de uma vez. O loop do agente
 * (application/ia/copiloto.ts) e a montagem de propostas não mudam nada aqui:
 * esta porta só grava o que já foi decidido em outra camada.
 */
import type { Conversa, MensagemConversa, Proveniencia } from '@/domain/model/entidades';

export interface ConversaComMensagens {
  conversa: Conversa;
  mensagens: MensagemConversa[];
}

export interface NovoTurno {
  pergunta: string;
  resposta: string;
  /** `null` quando a resposta não teve nenhuma ferramenta/proposta/alerta a guardar. */
  proveniencia: Proveniencia | null;
}

export interface ConversaPort {
  criar(titulo: string): Promise<Conversa>;

  /** Conversas do dono, mais recentemente atualizadas primeiro. */
  listar(): Promise<Conversa[]>;

  /**
   * Uma conversa com todas as mensagens, em ordem cronológica. `null` quando o
   * id não existe OU pertence a outro dono — os dois casos são
   * indistinguíveis de propósito (regra de ouro do multi-tenant).
   */
  obterComMensagens(id: string): Promise<ConversaComMensagens | null>;

  /**
   * Grava as DUAS mensagens do turno (usuário + assistente) e bumpa
   * `atualizadaEm` da conversa, numa única transação: uma pergunta gravada sem
   * a resposta correspondente (ou vice-versa) é bug, não estado válido.
   */
  anexarTurno(conversaId: string, turno: NovoTurno): Promise<void>;

  /** As `limite` mensagens mais recentes, em ordem cronológica — para montar
   * a janela de contexto reenviada ao provedor de IA. */
  ultimasMensagens(conversaId: string, limite: number): Promise<MensagemConversa[]>;

  renomear(id: string, titulo: string): Promise<void>;

  excluir(id: string): Promise<void>;
}
