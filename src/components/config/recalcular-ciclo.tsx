'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { recalcularCicloAtual } from '@/actions/ciclos';

/**
 * Ação explícita de recalcular o ciclo atual (SPEC 5.2). Com aviso claro de
 * que o histórico do ciclo será reescrito — por isso exige confirmação.
 */
export function RecalcularCiclo() {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const executar = () => {
    startTransition(async () => {
      const r = await recalcularCicloAtual();
      setMsg(r.ok ? 'Ciclo atual recalculado.' : r.erro);
      setConfirmar(false);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-atencao/40 bg-atencao/5 p-5">
      <div className="flex items-center gap-2 text-atencao">
        <AlertTriangle size={16} />
        <p className="text-sm font-medium">Recalcular o ciclo atual</p>
      </div>
      <p className="mt-2 text-sm text-muted">
        Normalmente as mudanças só valem no próximo ciclo. Recalcular reaplica os parâmetros atuais
        ao ciclo em andamento e <strong>reescreve o histórico dele</strong> — o teto de hoje pode
        mudar.
      </p>
      {!confirmar ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setConfirmar(true)}>
          Recalcular ciclo atual…
        </Button>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="danger" size="sm" onClick={executar} disabled={pending}>
            {pending ? 'Recalculando…' : 'Confirmar recálculo'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {msg ? <p className="mt-2 text-sm text-positivo">{msg}</p> : null}
    </div>
  );
}
