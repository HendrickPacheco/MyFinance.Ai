'use client';

import { useState, useTransition } from 'react';
import { LifeBuoy } from 'lucide-react';
import { formatBRL } from '@/shared/dinheiro';
import { puxarDaReserva } from '@/actions/ciclos';
import { useRouter } from 'next/navigation';

/**
 * Modo recuperação (SPEC 5.4): factual, orientado a ação, sem julgamento.
 * Mostra o déficit e as duas saídas com números.
 */
export function RecuperacaoCard({
  deficitCents,
  diasSemGastar,
  puxarCents,
}: {
  deficitCents: number;
  diasSemGastar: number;
  puxarCents: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const puxar = () => {
    if (puxarCents <= 0) return;
    startTransition(async () => {
      const r = await puxarDaReserva(puxarCents);
      if (r.ok) router.refresh();
      else setErro(r.erro);
    });
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-recuperacao/40 bg-recuperacao/10 p-5">
      <div className="flex items-center gap-2 text-recuperacao">
        <LifeBuoy size={18} />
        <h1 className="text-sm font-medium uppercase tracking-widest">Modo recuperação</h1>
      </div>

      <p className="mt-3 text-sm text-muted">Você está</p>
      <p className="tnum text-5xl font-bold leading-none text-recuperacao">
        {formatBRL(deficitCents)}
      </p>
      <p className="mt-1 text-sm text-muted">além da verba do ciclo. Duas saídas:</p>

      <div className="mt-5 space-y-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-fg">a) Segurar o gasto</p>
          <p className="mt-1 text-sm text-muted">
            Gasto zero pelos próximos <span className="tnum text-fg">{diasSemGastar}</span> dias
            fecha o buraco sem tocar na reserva.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-fg">b) Puxar da reserva</p>
          <p className="mt-1 text-sm text-muted">
            Trazer <span className="tnum text-fg">{formatBRL(puxarCents)}</span> da reserva para a
            conta do dia a dia e reduzir a meta de poupança em{' '}
            <span className="tnum text-fg">{formatBRL(puxarCents)}</span> só neste ciclo.
          </p>
          <button
            type="button"
            onClick={puxar}
            disabled={pending || puxarCents <= 0}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-recuperacao px-4 text-sm font-medium text-[#1a0d05] transition-all active:scale-95 disabled:opacity-50"
          >
            Puxar {formatBRL(puxarCents)} da reserva
          </button>
          {erro ? <p className="mt-2 text-sm text-negativo">{erro}</p> : null}
        </div>
      </div>
    </section>
  );
}
