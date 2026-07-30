'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { cn } from '@/lib/cn';

/** Passo 3: sobra (tone positivo) ou déficit (tone recuperação) do ciclo. */
export function PassoSobra({
  sobraCents,
  verbaVariavelCents,
  gastoRealizadoCents,
}: {
  sobraCents: number;
  verbaVariavelCents: number;
  gastoRealizadoCents: number;
}) {
  const deficit = sobraCents < 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. {deficit ? 'Déficit do ciclo' : 'Sobra do ciclo'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p
          className={cn(
            'tnum text-4xl font-bold leading-none',
            deficit ? 'text-recuperacao' : 'text-positivo',
          )}
        >
          {formatBRL(Math.abs(sobraCents))}
        </p>
        <p className="tnum text-sm text-muted">
          verba variável {formatBRL(verbaVariavelCents)} · gasto realizado{' '}
          {formatBRL(gastoRealizadoCents)}
        </p>
        <p className="text-sm text-muted">
          {deficit
            ? 'Este déficit fica registrado no fechamento do ciclo — nada é descontado automaticamente de nenhuma conta.'
            : 'Esta sobra será destinada conforme sua configuração de destino de sobra (reserva, investimento ou rollover para o próximo ciclo).'}
        </p>
      </CardContent>
    </Card>
  );
}
