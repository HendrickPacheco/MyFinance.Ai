/**
 * Ranking de corte (SPEC 5.5) — uma linha por categoria VARIAVEL, ordenada
 * por custo anualizado desc (já vem ordenado do application layer). O
 * número de impacto é o anualizado; frequência × ticket dá o contexto do
 * "porquê" sem apontar dedo.
 */
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import type { LinhaAnalise } from '@/application/analise';

const TENDENCIA_TONE = {
  SUBINDO: 'negativo',
  CAINDO: 'positivo',
  ESTAVEL: 'neutral',
} as const satisfies Record<LinhaAnalise['tendencia'], 'positivo' | 'negativo' | 'neutral'>;

const TENDENCIA_LABEL: Record<LinhaAnalise['tendencia'], string> = {
  SUBINDO: 'Subindo',
  CAINDO: 'Caindo',
  ESTAVEL: 'Estável',
};

export function RankingCorte({ ranking }: { ranking: readonly LinhaAnalise[] }) {
  if (ranking.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranking de corte</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {ranking.map((linha) => (
            <li key={linha.categoriaId} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{linha.nome}</p>
                  <p className="tnum mt-0.5 text-sm text-muted">
                    {linha.frequenciaMedia.toFixed(1)}× · {formatBRL(linha.ticketMedioCents)}
                  </p>
                  <p className="tnum mt-0.5 text-sm text-faint">
                    {formatBRL(linha.totalMedioMensalCents)} /mês
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <p className="tnum text-lg font-semibold leading-tight text-fg">
                    {formatBRL(linha.custoAnualizadoCents)}
                    <span className="ml-1 text-xs font-normal text-muted">/ano</span>
                  </p>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {linha.essencial ? <Badge tone="neutral">essencial</Badge> : null}
                    <Badge tone={TENDENCIA_TONE[linha.tendencia]}>
                      {TENDENCIA_LABEL[linha.tendencia]}
                    </Badge>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
