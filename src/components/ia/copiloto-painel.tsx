'use client';

/**
 * Painel do copiloto (Fase 3): lista de conversas + chat, lado a lado.
 *
 * DESKTOP APENAS (≥1024px) — a coluna da lista some com `hidden lg:flex`, e
 * no mobile isto se reduz exatamente ao chat único de sempre: mesmo
 * componente `CopilotoChat`, sem nenhuma lista visível e sem nenhuma rota
 * nova. Não há `/copiloto/[id]` nem entrada na `Nav` inferior — de propósito,
 * é escopo travado pelo dono desta fase.
 *
 * ─── AS DUAS NOÇÕES DE "CONVERSA ATIVA", E POR QUE SÃO SEPARADAS ───
 *
 * `conversaSelecionadaId` decide o QUE MONTAR: é a base da `key` do
 * `CopilotoChat`, e só muda por ação explícita do usuário (clicar numa
 * conversa da lista, ou em "Nova conversa"). Trocar esta id força remontagem
 * — de propósito, é como o chat troca de conteúdo ao mudar de conversa.
 *
 * `conversaAtivaId` decide o que fica DESTACADO na lista. O `CopilotoChat`
 * chama `onTurnoConcluido` com o id real depois da 1ª resposta de uma
 * conversa nova (que entrou como `null`) — só isto precisa mudar aqui, para a
 * lista destacar a linha certa. Se fosse a MESMA variável que vira a `key`,
 * o chat remontaria assim que a conversa nova ganhasse id, e o cartão de
 * proposta que acabou de chegar (ainda interativo, ainda não confirmado)
 * seria substituído por uma versão inerte antes que o dono tivesse a chance
 * de clicar — exatamente o bug que `CartaoPropostaInerte` existe para evitar
 * na direção contrária (reabertura), não para introduzir na direção do chat
 * ao vivo.
 */
import * as React from 'react';
import { abrirConversaIA, excluirConversaIA, listarConversasIA, renomearConversaIA } from '@/actions/ia';
import type { Conversa, MensagemConversa } from '@/domain/model/entidades';
import { CopilotoChat } from './copiloto-chat';
import { ListaConversas } from './lista-conversas';

export function CopilotoPainel() {
  const [conversas, setConversas] = React.useState<Conversa[]>([]);
  const [carregandoConversas, setCarregandoConversas] = React.useState(true);
  const [conversaSelecionadaId, setConversaSelecionadaId] = React.useState<string | null>(null);
  const [conversaAtivaId, setConversaAtivaId] = React.useState<string | null>(null);
  const [mensagensCarregadas, setMensagensCarregadas] = React.useState<MensagemConversa[]>([]);
  const [carregandoMensagens, setCarregandoMensagens] = React.useState(false);
  // Incrementado a cada "Nova conversa" — garante uma `key` nova mesmo quando
  // já se estava numa conversa nova (selecionadaId já era `null`), senão o
  // chat não remontaria e os turnos da tentativa anterior ficariam na tela.
  const [novaTick, setNovaTick] = React.useState(0);

  const carregarConversas = React.useCallback(async () => {
    const resultado = await listarConversasIA();
    if (resultado.ok) setConversas(resultado.data);
  }, []);

  React.useEffect(() => {
    void (async () => {
      setCarregandoConversas(true);
      await carregarConversas();
      setCarregandoConversas(false);
    })();
  }, [carregarConversas]);

  const selecionar = React.useCallback(async (id: string) => {
    setConversaSelecionadaId(id);
    setConversaAtivaId(id);
    setCarregandoMensagens(true);
    const resultado = await abrirConversaIA(id);
    setMensagensCarregadas(resultado.ok && resultado.data ? resultado.data.mensagens : []);
    setCarregandoMensagens(false);
  }, []);

  const nova = React.useCallback(() => {
    setConversaSelecionadaId(null);
    setConversaAtivaId(null);
    setMensagensCarregadas([]);
    setNovaTick((t) => t + 1);
  }, []);

  const renomear = React.useCallback(async (id: string, titulo: string): Promise<boolean> => {
    const resultado = await renomearConversaIA(id, titulo);
    if (!resultado.ok) return false;
    // Atualização local em vez de recarregar a lista inteira: a action já
    // `revalidatePath`s a rota, mas isso só refaz componentes de SERVIDOR —
    // este estado é buscado no cliente (`listarConversasIA` via `useEffect`),
    // então sem isto o título só apareceria certo depois de um reload manual.
    setConversas((atual) => atual.map((c) => (c.id === id ? { ...c, titulo } : c)));
    return true;
  }, []);

  const excluir = React.useCallback(
    async (id: string): Promise<boolean> => {
      const resultado = await excluirConversaIA(id);
      if (!resultado.ok) return false;

      setConversas((atual) => atual.filter((c) => c.id !== id));
      if (conversaAtivaId === id) setConversaAtivaId(null);

      // A conversa excluída é a que está montada no chat agora — sem isto o
      // chat ficaria com uma `key` (e um `conversaIdInicial`) apontando para
      // um id que não existe mais no banco.
      if (conversaSelecionadaId === id) {
        setConversaSelecionadaId(null);
        setMensagensCarregadas([]);
        setNovaTick((t) => t + 1);
      }
      return true;
    },
    [conversaAtivaId, conversaSelecionadaId],
  );

  const aoConcluirTurno = React.useCallback(
    (idConversaUsada: string) => {
      setConversaAtivaId(idConversaUsada);
      // Refaz a lista para o título (conversa nova) e o `atualizadaEm`
      // (reordenação por mais recente) refletirem o turno que acabou de
      // acontecer. É uma leitura barata comparada ao turno de IA que já
      // aconteceu, então recarregar sempre é mais simples do que remontar a
      // lista manualmente aqui.
      void carregarConversas();
    },
    [carregarConversas],
  );

  const chaveChat = conversaSelecionadaId ?? `nova-${novaTick}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
      <aside className="hidden lg:block lg:sticky lg:top-6 lg:h-[calc(100vh-8rem)]">
        <ListaConversas
          conversas={conversas}
          carregando={carregandoConversas}
          conversaAtivaId={conversaAtivaId}
          onSelecionar={(id) => void selecionar(id)}
          onNova={nova}
          onRenomear={renomear}
          onExcluir={excluir}
        />
      </aside>

      <div>
        {carregandoMensagens ? (
          <p className="text-sm text-muted">Carregando conversa…</p>
        ) : (
          <CopilotoChat
            key={chaveChat}
            conversaIdInicial={conversaSelecionadaId}
            mensagensIniciais={mensagensCarregadas}
            onTurnoConcluido={aoConcluirTurno}
          />
        )}
      </div>
    </div>
  );
}
