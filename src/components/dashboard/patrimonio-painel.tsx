/**
 * Patrimônio/investimentos por classe + curva — o que a planilha do usuário
 * não mostrava (briefing do pedido). Reaproveita o chart de curva já
 * existente em `src/components/patrimonio` (mesma forma de dado).
 */
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import { CurvaPatrimonioChart } from '@/components/patrimonio/curva-patrimonio-chart';
import { CLASSE_LABEL } from '@/components/patrimonio/classe-patrimonio';
import type { ResumoPatrimonioPainel } from '@/application/dashboard-tipos';
import { atribuirCoresCategoricas } from './cores';

export function PatrimonioPainel({ patrimonio }: { patrimonio: ResumoPatrimonioPainel }) {
  const { totalCents, variacaoCents, mesesDeReserva, porClasse, curva } = patrimonio;

  if (totalCents === 0 && porClasse.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Patrimônio</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            titulo="Nenhum patrimônio cadastrado"
            descricao="Registre contas, reserva e investimentos para acompanhar a curva de patrimônio aqui."
            acao={
              <Link
                href="/patrimonio"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent px-5 font-medium text-accent-fg"
              >
                Ir para patrimônio
              </Link>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const classesComCor = atribuirCoresCategoricas(
    porClasse.filter((c) => c.totalCents !== 0),
    (c) => c.classe,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patrimônio</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Total atual</p>
            <p className="tnum mt-1 text-xl font-semibold text-fg">{formatBRL(totalCents)}</p>
          </div>
          {variacaoCents !== null ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Variação</p>
              <p
                className={cn(
                  'tnum mt-1 text-xl font-semibold',
                  variacaoCents >= 0 ? 'text-positivo' : 'text-negativo',
                )}
              >
                {variacaoCents >= 0 ? '+' : ''}
                {formatBRL(variacaoCents)}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Meses de reserva</p>
            {mesesDeReserva !== null ? (
              <p className="tnum mt-1 text-xl font-semibold text-fg">
                {mesesDeReserva.toFixed(1)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">
                Feche o primeiro ciclo para o app aprender seu custo mensal.
              </p>
            )}
          </div>
        </div>

        {classesComCor.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {classesComCor.map(({ item, cor }) => (
              <li key={item.classe} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: cor }}
                />
                <span className="min-w-0 flex-1 truncate text-muted">
                  {CLASSE_LABEL[item.classe]}
                </span>
                <span className="tnum shrink-0 font-medium text-fg">
                  {formatBRL(item.totalCents)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6">
          <CurvaPatrimonioChart curva={curva} />
        </div>
      </CardContent>
    </Card>
  );
}
