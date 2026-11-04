/**
 * Renda do ciclo (D8): a real confirmada quando houver, senão a prevista. Em
 * USD mostra bruta, cotação e líquido; em BRL, só o líquido.
 */
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { formatBRL, formatTaxaBRL, formatUSD } from '@/shared/dinheiro';
import { formatarDataCurta } from '@/shared/data';
import type { ResumoRendaCiclo } from '@/application/dashboard-tipos';

export function RendaCicloCard({ renda }: { renda: ResumoRendaCiclo }) {
  const partes: string[] = [];
  if (renda.brutaOrigemCents !== null) partes.push(formatUSD(renda.brutaOrigemCents));
  if (renda.taxaMicros !== null) {
    partes.push(
      `cotação ${formatTaxaBRL(renda.taxaMicros)}` +
        (renda.dataCotacao ? ` (${formatarDataCurta(renda.dataCotacao)})` : ''),
    );
  }
  partes.push(`líquido ${formatBRL(renda.liquidaCents)}`);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Renda do ciclo</CardTitle>
        {renda.confirmada ? <Badge tone="positivo">confirmada</Badge> : <Badge>prevista</Badge>}
      </CardHeader>
      <CardContent>
        <p className="tnum text-3xl font-semibold text-fg">{formatBRL(renda.liquidaCents)}</p>
        <p className="tnum mt-2 text-sm text-muted">{partes.join(' · ')}</p>
        {renda.moeda === 'USD' ? (
          <p className="tnum mt-1 text-xs text-faint">{renda.decomposicao}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
