'use client';

/**
 * Uma linha do extrato do ciclo com menu de ações (Editar / Estornar /
 * Excluir) — SPEC 7. Cada ação chama a server action correspondente e, em
 * caso de sucesso, atualiza a tela via router.refresh().
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { formatBRL, parseBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { Button, ConfirmInline, Input, Label, Select } from '@/components/ui';
import { editarTransacao, excluirTransacao, estornarTransacao } from '@/actions/transacoes';
import type { Categoria, Transacao } from '@/domain/model/entidades';

const TOM_VALOR: Record<Transacao['tipo'], { sinal: '+' | '-' | ''; cor: string }> = {
  DESPESA: { sinal: '-', cor: 'text-negativo' },
  RENDA: { sinal: '+', cor: 'text-positivo' },
  TRANSFERENCIA: { sinal: '', cor: 'text-fg' },
  ESTORNO: { sinal: '', cor: 'text-fg' },
};

/**
 * Texto factual (SPEC seção 11 — nunca julgador) para a confirmação de
 * retroatividade (SPEC regra 9): a transação toca um ciclo já fechado, e
 * confirmar recalcula a sobra daquele ciclo.
 */
const TITULO_RETROATIVO = 'Esta transação pertence a um ciclo já fechado.';

function descricaoRetroativo(ciclosAfetados: string[] | undefined): string {
  const base = 'Confirmar vai recalcular a sobra daquele ciclo.';
  if (!ciclosAfetados || ciclosAfetados.length === 0) return base;
  const lista = ciclosAfetados.join(', ');
  return ciclosAfetados.length > 1
    ? `Confirmar vai recalcular a sobra dos ciclos: ${lista}.`
    : `Confirmar vai recalcular a sobra do ciclo ${lista}.`;
}

/** Estado de uma confirmação inline pendente (substitui `window.confirm`). */
type Confirmacao =
  | { acao: 'excluir-destrutivo' }
  | { acao: 'excluir-retroativo'; ciclosAfetados?: string[] }
  | { acao: 'estornar-retroativo'; ciclosAfetados?: string[] }
  | { acao: 'editar-retroativo'; valorCents: number; ciclosAfetados?: string[] };

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

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
  const [menuAberto, setMenuAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  const [valorTexto, setValorTexto] = useState(() => formatBRL(transacao.valorCents));
  const [categoriaId, setCategoriaId] = useState(transacao.categoriaId ?? '');
  const [descricao, setDescricao] = useState(transacao.descricao ?? '');
  const [data, setData] = useState(transacao.data);

  const descricaoExibida = transacao.descricao ?? categoria?.nome ?? '—';
  const tom = TOM_VALOR[transacao.tipo];

  const executarExclusao = useCallback(
    async (confirmarRetroativo: boolean) => {
      setPendente(true);
      setErro(null);
      const r = await excluirTransacao(transacao.id, confirmarRetroativo);
      setPendente(false);
      if (r.ok) {
        setConfirmacao(null);
        router.refresh();
        return;
      }
      if (r.requerConfirmacao && !confirmarRetroativo) {
        setConfirmacao({ acao: 'excluir-retroativo', ciclosAfetados: r.ciclosAfetados });
        return;
      }
      setConfirmacao(null);
      setErro(r.erro);
    },
    [transacao.id, router],
  );

  const excluir = useCallback(() => {
    setMenuAberto(false);
    setConfirmacao({ acao: 'excluir-destrutivo' });
  }, []);

  const executarEstorno = useCallback(
    async (confirmarRetroativo: boolean) => {
      setPendente(true);
      setErro(null);
      const r = await estornarTransacao(transacao.id, undefined, undefined, confirmarRetroativo);
      setPendente(false);
      if (r.ok) {
        setConfirmacao(null);
        router.refresh();
        return;
      }
      if (r.requerConfirmacao && !confirmarRetroativo) {
        setConfirmacao({ acao: 'estornar-retroativo', ciclosAfetados: r.ciclosAfetados });
        return;
      }
      setConfirmacao(null);
      setErro(r.erro);
    },
    [transacao.id, router],
  );

  const estornar = useCallback(() => {
    setMenuAberto(false);
    void executarEstorno(false);
  }, [executarEstorno]);

  const abrirEdicao = useCallback(() => {
    setMenuAberto(false);
    setErro(null);
    setEditando(true);
  }, []);

  const executarEdicao = useCallback(
    async (valorCents: number, confirmarRetroativo: boolean) => {
      setPendente(true);
      setErro(null);
      const r = await editarTransacao(transacao.id, {
        valorCents,
        categoriaId: categoriaId || null,
        descricao: descricao || null,
        data,
        confirmarRetroativo,
      });
      setPendente(false);
      if (r.ok) {
        setConfirmacao(null);
        setEditando(false);
        router.refresh();
        return;
      }
      if (r.requerConfirmacao && !confirmarRetroativo) {
        setConfirmacao({ acao: 'editar-retroativo', valorCents, ciclosAfetados: r.ciclosAfetados });
        return;
      }
      setConfirmacao(null);
      setErro(r.erro);
    },
    [transacao.id, categoriaId, descricao, data, router],
  );

  const salvarEdicao = useCallback(() => {
    let valorCents: number;
    try {
      valorCents = parseBRL(valorTexto);
    } catch {
      setErro('Valor inválido.');
      return;
    }
    if (valorCents <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    void executarEdicao(valorCents, false);
  }, [valorTexto, executarEdicao]);

  const cancelarConfirmacao = useCallback(() => setConfirmacao(null), []);

  const confirmarAcaoPendente = useCallback(() => {
    if (!confirmacao) return;
    switch (confirmacao.acao) {
      case 'excluir-destrutivo':
        void executarExclusao(false);
        return;
      case 'excluir-retroativo':
        void executarExclusao(true);
        return;
      case 'estornar-retroativo':
        void executarEstorno(true);
        return;
      case 'editar-retroativo':
        void executarEdicao(confirmacao.valorCents, true);
        return;
    }
  }, [confirmacao, executarExclusao, executarEstorno, executarEdicao]);

  const confirmInlineEditar =
    confirmacao?.acao === 'editar-retroativo' ? (
      <ConfirmInline
        className="mt-3"
        titulo={TITULO_RETROATIVO}
        descricao={descricaoRetroativo(confirmacao.ciclosAfetados)}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        pendente={pendente}
        onConfirm={confirmarAcaoPendente}
        onCancel={cancelarConfirmacao}
      />
    ) : null;

  if (editando) {
    return (
      <li className="rounded-xl border border-border-strong bg-surface-2 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`valor-${transacao.id}`}>Valor</Label>
            <Input
              id={`valor-${transacao.id}`}
              inputMode="decimal"
              value={valorTexto}
              onChange={(e) => setValorTexto(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`data-${transacao.id}`}>Data</Label>
            <Input
              id={`data-${transacao.id}`}
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3">
          <Label htmlFor={`categoria-${transacao.id}`}>Categoria</Label>
          <Select
            id={`categoria-${transacao.id}`}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-3">
          <Label htmlFor={`descricao-${transacao.id}`}>Descrição</Label>
          <Input
            id={`descricao-${transacao.id}`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}

        {confirmInlineEditar ?? (
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendente}
              onClick={() => setEditando(false)}
            >
              Cancelar
            </Button>
            <Button type="button" variant="primary" size="sm" disabled={pendente} onClick={salvarEdicao}>
              Salvar
            </Button>
          </div>
        )}
      </li>
    );
  }

  const confirmInlineLinha = (() => {
    if (!confirmacao || confirmacao.acao === 'editar-retroativo') return null;
    if (confirmacao.acao === 'excluir-destrutivo') {
      return (
        <ConfirmInline
          titulo="Excluir esta transação?"
          descricao="Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          tone="negativo"
          pendente={pendente}
          onConfirm={confirmarAcaoPendente}
          onCancel={cancelarConfirmacao}
        />
      );
    }
    return (
      <ConfirmInline
        titulo={TITULO_RETROATIVO}
        descricao={descricaoRetroativo(confirmacao.ciclosAfetados)}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        pendente={pendente}
        onConfirm={confirmarAcaoPendente}
        onCancel={cancelarConfirmacao}
      />
    );
  })();

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
