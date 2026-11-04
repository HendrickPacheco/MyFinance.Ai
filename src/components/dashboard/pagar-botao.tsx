'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { marcarCustoFixoPago, marcarParcelaPaga } from '@/actions/pagamentos';

/** Pill "Pagar": rastreamento puro (marca pago), nunca cálculo. */
export function PagarBotao({ tipo, id }: { tipo: 'FIXO' | 'PARCELA'; id: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function pagar() {
    setErro(null);
    iniciar(async () => {
      const r = await (tipo === 'FIXO' ? marcarCustoFixoPago(id, true) : marcarParcelaPaga(id, true));
      if (r.ok) router.refresh();
      else setErro(r.erro);
    });
  }

  return (
    <button
      type="button"
      onClick={pagar}
      disabled={pendente}
      title={erro ?? undefined}
      className={`rounded-full border bg-surface px-3.5 py-1.5 text-xs font-semibold max-[760px]:px-2.5 disabled:opacity-60 ${erro ? 'border-negativo text-negativo' : 'border-accent-pill-border text-accent'}`}
    >
      {erro ? 'Tentar de novo' : 'Pagar'}
    </button>
  );
}
