'use client';

/**
 * Fluxo de exclusão de uma `Transacao`, com os dois passos de confirmação —
 * o destrutivo ("não pode ser desfeita") e o retroativo (CLAUDE.md R2) —
 * compartilhado pelas superfícies de extrato.
 *
 * Estava duplicado verbatim em `ciclo/transacao-linha.tsx` e
 * `dashboard/extrato-variaveis.tsx`, incluindo os dois `ConfirmInline`. Como o
 * segundo passo é a única defesa contra corromper `sobraCents` em silêncio,
 * ele não pode existir em cópias que envelhecem separadas.
 *
 * O hook devolve o `ConfirmInline` já montado porque é justamente o JSX que
 * era idêntico; quem chama decide ONDE renderizá-lo (as duas listas usam um
 * `<li>` extra logo abaixo da linha).
 */
import { useCallback, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmInline } from '@/components/ui';
import { excluirTransacao } from '@/actions/transacoes';
import { TITULO_RETROATIVO, descricaoRetroativo } from './retroatividade';

type EstadoExclusao =
  | { passo: 'destrutivo' }
  | { passo: 'retroativo'; ciclosAfetados: string[] | undefined };

export interface ExclusaoTransacao {
  /** Abre o primeiro passo ("Excluir esta transação?"). */
  pedirExclusao: () => void;
  /** Há chamada de servidor em curso — quem chama desabilita seus botões. */
  pendente: boolean;
  /** Erro da action, para a linha exibir. */
  erro: string | null;
  /** `ConfirmInline` do passo corrente, ou `null` quando não há confirmação aberta. */
  confirmacao: ReactNode;
}

export function useExclusaoTransacao(transacaoId: string): ExclusaoTransacao {
  const router = useRouter();
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoExclusao | null>(null);

  const executar = useCallback(
    async (confirmarRetroativo: boolean) => {
      setPendente(true);
      setErro(null);
      const r = await excluirTransacao(transacaoId, confirmarRetroativo);
      setPendente(false);
      if (r.ok) {
        setEstado(null);
        router.refresh();
        return;
      }
      if (r.requerConfirmacao && !confirmarRetroativo) {
        setEstado({ passo: 'retroativo', ciclosAfetados: r.ciclosAfetados });
        return;
      }
      setEstado(null);
      setErro(r.erro);
    },
    [transacaoId, router],
  );

  const pedirExclusao = useCallback(() => setEstado({ passo: 'destrutivo' }), []);
  const cancelar = useCallback(() => setEstado(null), []);

  const confirmacao: ReactNode =
    estado === null ? null : estado.passo === 'destrutivo' ? (
      <ConfirmInline
        titulo="Excluir esta transação?"
        descricao="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        tone="negativo"
        pendente={pendente}
        onConfirm={() => void executar(false)}
        onCancel={cancelar}
      />
    ) : (
      <ConfirmInline
        titulo={TITULO_RETROATIVO}
        descricao={descricaoRetroativo(estado.ciclosAfetados)}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        pendente={pendente}
        onConfirm={() => void executar(true)}
        onCancel={cancelar}
      />
    );

  return { pedirExclusao, pendente, erro, confirmacao };
}
