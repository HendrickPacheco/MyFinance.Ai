'use client';

/**
 * Uma linha do extrato do ciclo com menu de ações (Editar / Estornar /
 * Excluir) — SPEC 7. Cada ação chama a server action correspondente e, em
 * caso de sucesso, atualiza a tela via router.refresh().
 *
 * O formulário de edição e o fluxo de exclusão saíram daqui na Fase 9 do
 * TASKS-CUSTOS (§5 débito 2): eram cópias literais das que viviam em
 * `dashboard/extrato-variaveis.tsx`. Hoje moram em `components/transacoes/`.
 * O que sobra neste arquivo é o que é MESMO só desta superfície: o menu ⋯, o
 * estorno (que o extrato de variáveis não oferece) e o tom por tipo de
 * transação — a tela do Ciclo lista RENDA e TRANSFERENCIA também.
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { formatarDataCurta } from '@/shared/data';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { ConfirmInline } from '@/components/ui';
import { estornarTransacao } from '@/actions/transacoes';
import { TITULO_RETROATIVO, descricaoRetroativo } from '@/components/transacoes/retroatividade';
import { TransacaoEdicaoForm } from '@/components/transacoes/transacao-edicao-form';
import { useExclusaoTransacao } from '@/components/transacoes/use-exclusao-transacao';
import type { Categoria, Transacao } from '@/domain/model/entidades';
import { usePodeEscrever } from '@/components/auth/ator-contexto';

const TOM_VALOR: Record<Transacao['tipo'], { sinal: '+' | '-' | ''; cor: string }> = {
  DESPESA: { sinal: '-', cor: 'text-negativo' },
  RENDA: { sinal: '+', cor: 'text-positivo' },
  TRANSFERENCIA: { sinal: '', cor: 'text-fg' },
  ESTORNO: { sinal: '', cor: 'text-fg' },
};

export function TransacaoLinha({
  transacao,
  categoria,
  categorias,
}: {
  transacao: Transacao;
  categoria: Categoria | undefined;
  categorias: Categoria[];
}) {
  const router = useRouter();
  // UX: VIEWER não vê editar/estornar/excluir. A trava real é `exigirEscrita`
  // no caso de uso (TASKS-AUTH §2.3).
  const podeEscrever = usePodeEscrever();
  const [menuAberto, setMenuAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [pendenteEstorno, setPendenteEstorno] = useState(false);
  const [erroEstorno, setErroEstorno] = useState<string | null>(null);
  const [estornoRetroativo, setEstornoRetroativo] = useState<string[] | undefined | null>(null);

  const exclusao = useExclusaoTransacao(transacao.id);

  const descricaoExibida = transacao.descricao ?? categoria?.nome ?? '—';
  const tom = TOM_VALOR[transacao.tipo];
  const pendente = pendenteEstorno || exclusao.pendente;
  const erro = erroEstorno ?? exclusao.erro;

  const executarEstorno = useCallback(
    async (confirmarRetroativo: boolean) => {
      setPendenteEstorno(true);
      setErroEstorno(null);
      const r = await estornarTransacao(transacao.id, undefined, undefined, confirmarRetroativo);
      setPendenteEstorno(false);
      if (r.ok) {
        setEstornoRetroativo(null);
        router.refresh();
        return;
      }
      if (r.requerConfirmacao && !confirmarRetroativo) {
        setEstornoRetroativo(r.ciclosAfetados);
        return;
      }
      setEstornoRetroativo(null);
      setErroEstorno(r.erro);
    },
    [transacao.id, router],
  );

  const excluir = useCallback(() => {
    setMenuAberto(false);
    exclusao.pedirExclusao();
  }, [exclusao]);

  const estornar = useCallback(() => {
    setMenuAberto(false);
    void executarEstorno(false);
  }, [executarEstorno]);

  const abrirEdicao = useCallback(() => {
    setMenuAberto(false);
    setErroEstorno(null);
    setEditando(true);
  }, []);

  if (editando) {
    return (
      <TransacaoEdicaoForm
        transacaoId={transacao.id}
        valorCents={transacao.valorCents}
        data={transacao.data}
        categoriaId={transacao.categoriaId}
        descricao={transacao.descricao}
        categorias={categorias}
        onCancelar={() => setEditando(false)}
        onSalvo={() => setEditando(false)}
      />
    );
  }

  const confirmInlineLinha =
    estornoRetroativo !== null ? (
      <ConfirmInline
        titulo={TITULO_RETROATIVO}
        descricao={descricaoRetroativo(estornoRetroativo)}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        pendente={pendenteEstorno}
        onConfirm={() => void executarEstorno(true)}
        onCancel={() => setEstornoRetroativo(null)}
      />
    ) : (
      exclusao.confirmacao
    );

  return (
    <>
      <li className="flex items-center gap-3 py-3">
        <div className="w-10 shrink-0 text-xs text-faint">{formatarDataCurta(transacao.data)}</div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-fg">{descricaoExibida}</p>
          <p className="truncate text-xs text-muted">
            {[categoria?.nome, transacao.metodo].filter(Boolean).join(' · ') || '—'}
          </p>
          {erro ? <p className="mt-1 text-xs text-negativo">{erro}</p> : null}
        </div>

        <div className={cn('tnum shrink-0 text-sm font-medium', tom.cor)}>
          {tom.sinal}
          {formatBRL(transacao.valorCents)}
        </div>

        <div className="relative shrink-0">
          {podeEscrever ? (
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            disabled={pendente}
            aria-label="Ações da transação"
            aria-haspopup="menu"
            aria-expanded={menuAberto}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
          >
            <MoreVertical size={18} />
          </button>
          ) : null}

          {menuAberto ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
              <div
                role="menu"
                className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-xl border border-border-strong bg-surface-2 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={abrirEdicao}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-fg hover:bg-surface"
                >
                  <Pencil size={15} /> Editar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={estornar}
                  disabled={transacao.tipo === 'ESTORNO'}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-fg hover:bg-surface disabled:opacity-40"
                >
                  <RotateCcw size={15} /> Estornar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={excluir}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-negativo hover:bg-surface"
                >
                  <Trash2 size={15} /> Excluir
                </button>
              </div>
            </>
          ) : null}
        </div>
      </li>
      {confirmInlineLinha ? <li className="py-3">{confirmInlineLinha}</li> : null}
    </>
  );
}
