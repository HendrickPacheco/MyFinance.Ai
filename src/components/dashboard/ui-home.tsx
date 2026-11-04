import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatarReaisInteiros } from '@/shared/dinheiro';

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

/**
 * Número de destaque em reais inteiros. Padrão: "R$ 2.879" inline; `simboloMenor`
 * (só o hero) deixa o "R$" menor e apagado.
 */
export function Valor({
  cents,
  simboloMenor,
  sufixo,
}: {
  cents: number;
  simboloMenor?: boolean;
  sufixo?: string;
}) {
  return (
    <>
      {simboloMenor ? (
        <span className="mr-1.5 text-[32px] font-bold text-faint">R$</span>
      ) : (
        'R$ '
      )}
      {formatarReaisInteiros(cents)}
      {sufixo ? <span className="text-base font-semibold text-faint"> {sufixo}</span> : null}
    </>
  );
}
