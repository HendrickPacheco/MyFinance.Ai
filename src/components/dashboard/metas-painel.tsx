/**
 * Metas traçadas vs. realizado — o outro furo da planilha do usuário
 * (briefing do pedido). Mostra a poupança do mês por completo: a meta já
 * reservada (`poupancaAlvoCents`) e a projeção no fechamento somando a sobra
 * DA VERBA VARIÁVEL (`poupancaProjetadaCents` = alvo + sobra). A sobra da
 * verba nunca aparece sozinha rotulada como "sobra" — sempre com o contexto
 * de que é a projeção da verba, não a poupança inteira do mês. Barra de
 * progresso reaproveita o padrão visual do `RitmoCard` (SPEC 7 /
 * src/components/ciclo/ritmo-card.tsx).
 */
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';
import type { ResumoMetas } from '@/application/dashboard-tipos';

export function MetasPainel({ metas }: { metas: ResumoMetas }) {
  const {
    poupancaAlvoCents,
    poupancaProjetadaCents,
    sobraDaVerbaCents,
    progressoPercentual,
    metaPoupancaPercent,
    avisoMetaIrreal,
  } = metas;

  const atingida = progressoPercentual >= 100;
  const percentualBarra = Math.min(Math.max(progressoPercentual, 0), 100);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Poupança do mês</CardTitle>
        {metaPoupancaPercent !== null ? (
          <Badge tone="neutral">{metaPoupancaPercent}% da renda</Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted">Meta reservada</p>
            <p className="tnum mt-0.5 text-lg font-medium text-fg">
              {formatBRL(poupancaAlvoCents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Projeção no fechamento</p>
            <p
              className={cn(
                'tnum mt-0.5 text-lg font-medium',
                atingida ? 'text-positivo' : 'text-fg',
              )}
            >
              {formatBRL(poupancaProjetadaCents)}
            </p>
          </div>
        </div>

        <p className="mt-2 text-xs text-muted">
          Meta reservada ({formatBRL(poupancaAlvoCents)}) + sobra da verba (projeção),{' '}
          <span className={cn('tnum', sobraDaVerbaCents < 0 ? 'text-negativo' : 'text-fg')}>
            {formatBRL(sobraDaVerbaCents)}
          </span>
          . A sobra da verba não é poupança garantida — some ao fechar o ciclo sem estourar o
          orçamento variável.
        </p>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Progresso</span>
            <span className="tnum">{percentualBarra.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn('h-full rounded-full transition-all', atingida ? 'bg-positivo' : 'bg-accent')}
              style={{ width: `${percentualBarra}%` }}
            />
          </div>
        </div>

        {avisoMetaIrreal?.irreal ? (
          <p className="mt-3 text-sm text-atencao">
            A meta atual gera uma verba de {formatBRL(avisoMetaIrreal.verbaDiariaCents)} por dia,
            abaixo do piso de {formatBRL(avisoMetaIrreal.pisoDiarioCents)}. Vale revisar a meta na
            configuração.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
