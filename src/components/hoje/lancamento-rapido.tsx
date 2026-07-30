'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Delete } from 'lucide-react';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { criarTransacao, excluirTransacao } from '@/actions/transacoes';

interface CategoriaChip {
  id: string;
  nome: string;
  cor: string | null;
}

interface ToastState {
  transacaoId: string;
  texto: string;
}

export function LancamentoRapido({ categorias }: { categorias: CategoriaChip[] }) {
  const router = useRouter();
  const [centavos, setCentavos] = useState(0);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const digitar = useCallback((d: number) => {
    setErro(null);
    setCentavos((c) => Math.min(c * 10 + d, 99_999_999)); // teto R$ 999.999,99
  }, []);

  const apagar = useCallback(() => setCentavos((c) => Math.floor(c / 10)), []);

  const lancar = useCallback(
    (categoriaId: string, nome: string) => {
      if (centavos <= 0) {
        setErro('Digite um valor primeiro.');
        return;
      }
      const valor = centavos;
      startTransition(async () => {
        const r = await criarTransacao({ valorCents: valor, categoriaId });
        if (r.ok) {
          setCentavos(0);
          setToast({ transacaoId: r.data.id, texto: `${formatBRL(valor)} em ${nome}` });
          router.refresh();
          window.setTimeout(() => setToast(null), 5000);
        } else {
          setErro(r.erro);
        }
      });
    },
    [centavos, router],
  );

  const desfazer = useCallback(() => {
    if (!toast) return;
    const id = toast.transacaoId;
    setToast(null);
    startTransition(async () => {
      await excluirTransacao(id);
      router.refresh();
    });
  }, [toast, router]);

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="mt-6">
      {/* Valor sendo digitado */}
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm text-muted">Lançar gasto</span>
        <span
          className={cn('tnum text-2xl font-semibold', centavos > 0 ? 'text-fg' : 'text-faint')}
          aria-live="polite"
        >
          {formatBRL(centavos)}
        </span>
      </div>

      {/* Teclado numérico */}
      <div className="grid grid-cols-3 gap-2">
        {teclas.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => digitar(Number(t))}
            className="tnum h-14 rounded-xl bg-surface-2 text-xl font-medium text-fg transition-all active:scale-95 hover:brightness-125"
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCentavos((c) => Math.min(c * 100, 99_999_999))}
          className="tnum h-14 rounded-xl bg-surface-2 text-xl font-medium text-muted transition-all active:scale-95 hover:brightness-125"
          aria-label="Adicionar dois zeros"
        >
          00
        </button>
        <button
          type="button"
          onClick={() => digitar(0)}
          className="tnum h-14 rounded-xl bg-surface-2 text-xl font-medium text-fg transition-all active:scale-95 hover:brightness-125"
        >
          0
        </button>
        <button
          type="button"
          onClick={apagar}
          className="flex h-14 items-center justify-center rounded-xl bg-surface-2 text-muted transition-all active:scale-95 hover:brightness-125"
          aria-label="Apagar"
        >
          <Delete size={22} />
        </button>
      </div>

      {erro ? <p className="mt-3 text-sm text-negativo">{erro}</p> : null}

      {/* Chips de categoria — tocar salva */}
      <p className="mt-5 mb-2 text-sm text-muted">Toque na categoria para salvar</p>
      <div className="flex flex-wrap gap-2">
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending}
            onClick={() => lancar(c.id, c.nome)}
            className={cn(
              'min-h-[44px] rounded-full border border-border-strong px-4 text-sm font-medium transition-all',
              'active:scale-95 hover:border-accent hover:text-accent disabled:opacity-50',
            )}
            style={c.cor ? { borderColor: c.cor } : undefined}
          >
            {c.nome}
          </button>
        ))}
      </div>

      {/* Toast de undo (5s) */}
      {toast ? (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-full border border-border-strong bg-surface-2 px-5 py-3 shadow-lg">
            <span className="text-sm text-fg">Lançado {toast.texto}</span>
            <button
              type="button"
              onClick={desfazer}
              className="text-sm font-semibold text-accent hover:underline"
            >
              Desfazer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
