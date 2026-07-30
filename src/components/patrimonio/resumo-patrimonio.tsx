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
  temDados,
}: {
  mesesDeReserva: number;
  totalAtualCents: number;
  variacaoMensalCents: number;
  taxaAcumulacaoMediaCents: number;
  temDados: boolean;
}) {
  // `mesesDeReserva` volta 0 tanto quando não há custo mensal conhecido
  // quanto quando a reserva está genuinamente zerada — sem essa distinção
  // exposta pelo caso de uso, avisamos em vez de afirmar "0 meses".
  const semDadoConfiavel = temDados && mesesDeReserva === 0;

  return (
    <section aria-label="Meses de reserva" className="pt-4 text-center">
      <p className="text-sm uppercase tracking-widest text-muted">Reserva de segurança</p>
      {semDadoConfiavel ? (
        <p className="mt-3 text-2xl font-semibold text-muted">Dados insuficientes</p>
      ) : (
        <p className="tnum mt-2 text-6xl font-bold leading-none tracking-tight text-fg sm:text-7xl">
          {mesesDeReserva.toFixed(1)}
          <span className="ml-2 text-2xl font-medium text-muted">meses de reserva</span>
        </p>
      )}
      {semDadoConfiavel ? (
        <p className="mt-2 text-sm text-muted">
          Confira se há saldo em contas de reserva e custos fixos/provisões cadastrados.
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
