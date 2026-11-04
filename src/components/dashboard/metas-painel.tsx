/**
 * Meta vs. guardado de verdade. D-16: a meta (`poupancaAlvoCents`) é OBJETIVO,
 * não dinheiro separado — ela não é descontada da verba. O guardado é a
 * variação real do patrimônio desde o início do ciclo (D3), estimada enquanto
 * o ciclo corre. Nada aqui pode chamar a meta de "reservado".
 */
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { ResumoMetas } from '@/application/dashboard-tipos';

function Celula({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{rotulo}</p>
      <p className="tnum mt-0.5 text-lg font-medium text-fg">{children}</p>
    </div>
  );
}

export function MetasPainel({ metas }: { metas: ResumoMetas }) {
  const { poupancaAlvoCents, guardadoCents, diferencaCents, percentualReal } = metas;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Poupança do mês</CardTitle>
        {metas.metaPoupancaPercent !== null ? (
          <Badge tone="neutral">{metas.metaPoupancaPercent}% da renda</Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Celula rotulo="Meta">{formatBRL(poupancaAlvoCents)}</Celula>
          <Celula rotulo="Guardado de verdade (estimado)">
            {guardadoCents !== null ? formatBRL(guardadoCents) : '—'}
          </Celula>
          <Celula rotulo="Diferença">
            {diferencaCents !== null ? (
              <span className={diferencaCents >= 0 ? 'text-positivo' : 'text-negativo'}>
                {formatBRL(diferencaCents)}
              </span>
            ) : (
              '—'
            )}
          </Celula>
          <Celula rotulo="% real">
            {percentualReal !== null ? `${percentualReal.toFixed(1)}%` : '—'}
          </Celula>
        </div>

        {guardadoCents === null && metas.motivoSemGuardado ? (
          <p className="mt-3 text-sm text-muted">
            {metas.motivoSemGuardado}{' '}
            <Link href="/patrimonio" className="text-accent underline-offset-2 hover:underline">
              Registrar patrimônio
            </Link>
          </p>
        ) : metas.fonte === 'SALDO_CONTAS' ? (
          <p className="mt-2 text-xs text-muted">
            Estimado pelo que as transações do ciclo moveram nas contas; um snapshot de patrimônio deixa o número exato.
          </p>
        ) : null}

        <p className="mt-2 text-xs text-muted">
          A meta não sai da sua verba: ela é o objetivo. No ritmo de gasto atual, a verba fecha o
          ciclo com sobra de{' '}
          <span className={cn('tnum', metas.sobraDaVerbaCents < 0 ? 'text-negativo' : 'text-fg')}>
            {formatBRL(metas.sobraDaVerbaCents)}
          </span>
          .
        </p>

        {metas.avisoPiso ? <p className="mt-3 text-sm text-atencao">{metas.avisoPiso.texto}</p> : null}
      </CardContent>
    </Card>
  );
}
