'use client';

import { Card, CardHeader, CardTitle, CardContent, Label } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { MoneyInput } from './money-input';

export function PassoRenda({
  rendaPrevistaCents,
  valueCents,
  onChangeCents,
}: {
  rendaPrevistaCents: number;
  valueCents: number;
  onChangeCents: (cents: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Renda realizada</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Renda prevista para este ciclo:{' '}
          <span className="tnum text-fg">{formatBRL(rendaPrevistaCents)}</span>. Confirme (ou
          ajuste) quanto realmente entrou.
        </p>
        <div>
          <Label htmlFor="renda-realizada">Renda realizada</Label>
          <MoneyInput
            id="renda-realizada"
            valueCents={valueCents}
            onChangeCents={onChangeCents}
            aria-label="Renda realizada"
          />
        </div>
      </CardContent>
    </Card>
  );
}
