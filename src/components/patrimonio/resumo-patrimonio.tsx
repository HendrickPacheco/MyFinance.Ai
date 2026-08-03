/**
 * Hero de "meses de reserva" + resumo de totais (SPEC 5.6). Componente
 * puramente apresentacional — server-safe, sem estado.
 */
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';

export function ResumoPatrimonio({
  mesesDeReserva,
  totalAtualCents,
  variacaoMensalCents,
  taxaAcumulacaoMediaCents,
}: {
  /** `null` quando ainda não há histórico de ciclo fechado para conhecer o custo mensal. */
  mesesDeReserva: number | null;
  totalAtualCents: number;
  variacaoMensalCents: number;
  taxaAcumulacaoMediaCents: number;
  temDados: boolean;
}) {
  return (
    <section aria-label="Meses de reserva" className="pt-4 text-center">
      <p className="text-sm uppercase tracking-widest text-muted">Reserva de segurança</p>
      {mesesDeReserva !== null ? (
        <p className="tnum mt-2 text-6xl font-bold leading-none tracking-tight text-fg sm:text-7xl">
          {mesesDeReserva.toFixed(1)}
          <span className="ml-2 text-2xl font-medium text-muted">meses de reserva</span>
        </p>
      ) : (
        <p className="mt-3 text-2xl font-semibold text-muted">Ainda não calculável</p>
      )}
      {mesesDeReserva === null ? (
        <p className="mt-2 text-sm text-muted">
          Feche o primeiro ciclo para o app aprender seu custo mensal e calcular quantos meses a
          reserva sustenta.
        </p>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-muted">Total atual</p>
          <p className="tnum mt-1 text-xl font-semibold text-fg">{formatBRL(totalAtualCents)}</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-muted">Variação mensal</p>
          <p
            className={cn(
              'tnum mt-1 text-xl font-semibold',
              variacaoMensalCents >= 0 ? 'text-positivo' : 'text-negativo',
            )}
          >
            {variacaoMensalCents >= 0 ? '+' : ''}
            {formatBRL(variacaoMensalCents)}
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-muted">Acumulação média</p>
          <p className="tnum mt-1 text-xl font-semibold text-fg">
            {formatBRL(taxaAcumulacaoMediaCents)}
            <span className="ml-1 text-sm font-normal text-muted">/mês</span>
          </p>
        </div>
      </div>
    </section>
  );
}
