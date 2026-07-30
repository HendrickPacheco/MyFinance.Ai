import { cn } from '@/lib/cn';

/** Barra de progresso do wizard — puramente visual, sem estado. */
export function PassoIndicador({ atual, total }: { atual: number; total: number }) {
  const passos = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div
      className="mt-3 flex gap-1.5"
      role="progressbar"
      aria-valuenow={atual}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Passo ${atual} de ${total}`}
    >
      {passos.map((n) => (
        <span
          key={n}
          className={cn('h-1.5 flex-1 rounded-full', n <= atual ? 'bg-accent' : 'bg-surface-2')}
        />
      ))}
    </div>
  );
}
