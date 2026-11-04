/**
 * Verbas separadas (D1): "dia a dia" (piso diário × dias) e "extras" (o resto
 * do gastável). Parcela consome extras; o excedente dos extras reduz o dia a
 * dia. Server Component — números prontos do read-model, nenhuma conta aqui.
 */
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { ResumoVerbas } from '@/application/dashboard-tipos';

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className={cn('tnum text-sm font-medium', tom ?? 'text-fg')}>{formatBRL(valor)}</dd>
    </div>
  );
}

export function VerbasPainel({ verbas }: { verbas: ResumoVerbas }) {
  const { tetoDiaADia } = verbas;
  const estourados = verbas.extrasRestanteCents < 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Dia a dia</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted">Posso gastar hoje</p>
          <p
            className={cn(
              'tnum mt-0.5 text-3xl font-semibold',
              tetoDiaADia.restaHojeCents < 0 ? 'text-negativo' : 'text-positivo',
            )}
          >
            {formatBRL(verbas.podeGastarHojeCents)}
          </p>
          <dl className="mt-3 space-y-1">
            <Linha rotulo="Gasto hoje" valor={tetoDiaADia.gastoHojeCents} />
            <Linha rotulo="Usado no ciclo" valor={verbas.diaADiaUsadoCents} />
            <Linha rotulo="Dia a dia do ciclo" valor={verbas.diaADiaEfetivoCents} />
          </dl>
          <p className="mt-2 text-xs text-muted">
            Piso de {formatBRL(verbas.pisoDiarioCents)}/dia.
          </p>
          {verbas.faltaParaPisoCents > 0 ? (
            <p className="mt-2 text-sm text-atencao">
              Faltam {formatBRL(verbas.faltaParaPisoCents)} para cobrir o dia a dia.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Extras</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted">Restante no mês</p>
          <p
            className={cn(
              'tnum mt-0.5 text-3xl font-semibold',
              estourados ? 'text-negativo' : 'text-fg',
            )}
          >
            {formatBRL(verbas.extrasRestanteCents)}
          </p>
          <dl className="mt-3 space-y-1">
            <Linha rotulo="Disponível no mês" valor={verbas.extrasCents} />
            <Linha rotulo="Usado (inclui parcelas)" valor={verbas.extrasUsadoCents} />
          </dl>
          {estourados ? (
            <p className="mt-2 text-sm text-negativo">
              Extras estourados em {formatBRL(-verbas.extrasRestanteCents)} — isso reduziu seu dia a
              dia para {formatBRL(verbas.diaADiaPorDiaCents)}/dia.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
