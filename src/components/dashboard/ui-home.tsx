import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatarNumeroBRL } from '@/shared/dinheiro';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-[20px] border border-border bg-surface p-6 shadow-card', className)}>
      {children}
    </div>
  );
}

/** Barra de progresso; `fina` = 5px (.bar.t), senão 8px. */
export function Barra({
  percent,
  fina,
  opacidade,
  className,
}: {
  percent: number;
  fina?: boolean;
  opacidade?: number;
  className?: string;
}) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div
      className={cn('overflow-hidden rounded-full bg-track', fina ? 'h-[5px]' : 'h-2', className)}
    >
      <i
        className="block h-full rounded-full bg-accent"
        style={{ width: `${p}%`, opacity: opacidade }}
      />
    </div>
  );
}

/** Dinheiro com o "R$" menor e apagado. Sem centavos quando redondo. */
export function Valor({
  cents,
  simboloClassName = 'text-base font-semibold',
  sufixo,
}: {
  cents: number;
  simboloClassName?: string;
  sufixo?: string;
}) {
  return (
    <>
      <span className={cn('text-faint', simboloClassName)}>R$</span> {formatarNumeroBRL(cents)}
      {sufixo ? <span className="text-base font-semibold text-faint"> {sufixo}</span> : null}
    </>
  );
}
