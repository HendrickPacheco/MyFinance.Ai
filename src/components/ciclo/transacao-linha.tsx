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
import { Button, Input, Label, Select } from '@/components/ui';
import { editarTransacao, excluirTransacao, estornarTransacao } from '@/actions/transacoes';
import type { Categoria, Transacao } from '@/domain/model/entidades';

const TOM_VALOR: Record<Transacao['tipo'], { sinal: '+' | '-' | ''; cor: string }> = {
  DESPESA: { sinal: '-', cor: 'text-negativo' },
  RENDA: { sinal: '+', cor: 'text-positivo' },
  TRANSFERENCIA: { sinal: '', cor: 'text-fg' },
  ESTORNO: { sinal: '', cor: 'text-fg' },
};

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

  const [valorTexto, setValorTexto] = useState(() => formatBRL(transacao.valorCents));
  const [categoriaId, setCategoriaId] = useState(transacao.categoriaId ?? '');
  const [descricao, setDescricao] = useState(transacao.descricao ?? '');
  const [data, setData] = useState(transacao.data);

  const descricaoExibida = transacao.descricao ?? categoria?.nome ?? '—';
  const tom = TOM_VALOR[transacao.tipo];

  const excluir = useCallback(() => {
    setMenuAberto(false);
    if (!window.confirm('Excluir esta transação? Esta ação não pode ser desfeita.')) return;
    setPendente(true);
    setErro(null);
    void excluirTransacao(transacao.id).then((r) => {
      setPendente(false);
      if (r.ok) router.refresh();
      else setErro(r.erro);
    });
  }, [transacao.id, router]);

  const estornar = useCallback(() => {
    setMenuAberto(false);
    setPendente(true);
    setErro(null);
    void estornarTransacao(transacao.id).then((r) => {
      setPendente(false);
      if (r.ok) router.refresh();
      else setErro(r.erro);
    });
  }, [transacao.id, router]);

  const abrirEdicao = useCallback(() => {
    setMenuAberto(false);
    setErro(null);
    setEditando(true);
  }, []);

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

    setPendente(true);
    setErro(null);
    void editarTransacao(transacao.id, {
      valorCents,
      categoriaId: categoriaId || null,
      descricao: descricao || null,
      data,
    }).then((r) => {
      setPendente(false);
      if (r.ok) {
        setEditando(false);
        router.refresh();
      } else {
        setErro(r.erro);
      }
    });
  }, [transacao.id, valorTexto, categoriaId, descricao, data, router]);

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
      </li>
    );
  }

  return (
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
  );
}
