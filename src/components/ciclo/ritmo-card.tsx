/**
 * Card "Ritmo" (SPEC 5.3/7): média diária real, projeção de fechamento
 * comparada com a verba variável, badge de ritmo e barra de progresso do
 * gasto do ciclo. Puramente apresentacional — Server Component.
 */
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { ResultadoRitmo } from '@/domain/finance';

type ToneRitmo = 'positivo' | 'atencao' | 'negativo';

function tomRitmo(ritmo: number): { tone: ToneRitmo; label: string } {
  if (ritmo <= 1) return { tone: 'positivo', label: 'no ritmo' };
  if (ritmo <= 1.2) return { tone: 'atencao', label: 'atenção' };
  return { tone: 'negativo', label: 'acima do ritmo' };
}

const BARRA_TONE: Record<ToneRitmo, string> = {
  positivo: 'bg-positivo',
  atencao: 'bg-atencao',
  negativo: 'bg-negativo',
};

export function RitmoCard({
  ritmo,
  gastoRealizadoCents,
  verbaVariavelCents,
}: {
  ritmo: ResultadoRitmo;
  gastoRealizadoCents: number;
  verbaVariavelCents: number;
}) {
  const { tone, label } = tomRitmo(ritmo.ritmo);
  const projecaoAcimaDaVerba = ritmo.projecaoFechamentoCents > verbaVariavelCents;
  const percentualGasto =
    verbaVariavelCents > 0 ? Math.min(gastoRealizadoCents / verbaVariavelCents, 1) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Ritmo</CardTitle>
        <Badge tone={tone}>{label}</Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted">Média diária real</p>
            <p className="tnum mt-0.5 text-lg font-medium text-fg">
              {formatBRL(Math.round(ritmo.mediaDiariaRealCents))}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Projeção de fechamento</p>
            <p
              className={cn(
                'tnum mt-0.5 text-lg font-medium',
                projecaoAcimaDaVerba ? 'text-negativo' : 'text-fg',
              )}
            >
              {formatBRL(Math.round(ritmo.projecaoFechamentoCents))}
            </p>
          </div>
        </div>

        {projecaoAcimaDaVerba ? (
          <p className="mt-2 text-sm text-negativo">
            No ritmo atual, o ciclo deve fechar acima da verba variável.
          </p>
        ) : null}

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Gasto no ciclo</span>
            <span className="tnum">
              {formatBRL(gastoRealizadoCents)} de {formatBRL(verbaVariavelCents)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn('h-full rounded-full transition-all', BARRA_TONE[tone])}
              style={{ width: `${percentualGasto}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
