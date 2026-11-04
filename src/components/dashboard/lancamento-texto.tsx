'use client';

import { useCallback, useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { OpcaoCategoria } from '@/application/dashboard-tipos';
import { interpretarLancamentoRapido } from '@/domain/lancamento/interpretar';
import { criarTransacao, excluirTransacao } from '@/actions/transacoes';
import { Toast } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { Card } from './ui-home';

export function LancamentoTexto({ categorias }: { categorias: OpcaoCategoria[] }) {
  const router = useRouter();
  const idInput = useId();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const variaveis = useMemo(() => categorias.filter((c) => c.grupo === 'VARIAVEL'), [categorias]);

  const lancar = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const r = interpretarLancamentoRapido(texto, variaveis);
      if (!r.ok) return setErro(r.erro);
      const categoria = variaveis.find((c) => c.id === r.categoriaId) ?? variaveis[0];
      if (!categoria) return setErro('Cadastre uma categoria de gasto variável primeiro.');
      setErro(null);
      startTransition(async () => {
        const res = await criarTransacao({
          valorCents: r.valorCents,
          categoriaId: categoria.id,
          descricao: r.descricao,
          metodo: r.metodo,
          ...(r.tipoVerba ? { tipoVerbaOverride: r.tipoVerba } : {}),
        });
        if (!res.ok) return setErro(res.erro);
        setTexto('');
        setToast({ id: res.data.id, texto: `Lançado ${formatBRL(r.valorCents)} em ${categoria.nome}` });
        router.refresh();
        window.setTimeout(() => setToast(null), 5000);
      });
    },
    [texto, variaveis, router],
  );

  const desfazer = useCallback(() => {
    if (!toast) return;
    const id = toast.id;
    setToast(null);
    startTransition(async () => {
      await excluirTransacao(id);
      router.refresh();
    });
  }, [toast, router]);

  return (
    <>
      <form
        onSubmit={lancar}
        className="flex gap-2.5 max-[760px]:sticky max-[760px]:top-2.5 max-[760px]:z-[5]"
      >
        <Card className="flex w-full gap-2.5 rounded-[18px] p-2.5">
          <div className="grid place-items-center pl-2.5 text-accent" aria-hidden>
            <Plus size={18} strokeWidth={2} />
          </div>
          <label htmlFor={idInput} className="sr-only">
            Lançar gasto em texto
          </label>
          <input
            id={idInput}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: 80 mercado crédito"
            className="min-w-0 flex-1 bg-transparent px-3.5 text-[15px] font-medium text-fg outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-accent px-[26px] py-[13px] text-[15px] font-semibold text-accent-fg shadow-[0_6px_16px_-6px_var(--color-accent)] hover:bg-accent-hover disabled:opacity-50 max-[760px]:px-[18px] max-[760px]:py-3"
          >
            Lançar
          </button>
        </Card>
      </form>
      {erro ? (
        <p role="alert" className="mt-2 px-1 text-sm text-negativo">
          {erro}
        </p>
      ) : null}
      {toast ? <Toast texto={toast.texto} acao={{ label: 'Desfazer', onClick: desfazer }} /> : null}
    </>
  );
}
