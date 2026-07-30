'use client';

/**
 * Curva de patrimônio (SPEC 5.6): a linha subindo é o reforço positivo do
 * app — recebe destaque visual, sem gamificação (sem badges, sem confete).
 */
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatBRL } from '@/shared/dinheiro';
import type { PontoCurva } from '@/application/patrimonio';

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

function formatarReaisCompacto(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

function TooltipCurva({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const ponto = payload[0];
  const totalCents = typeof ponto?.value === 'number' ? ponto.value : 0;
  const data = typeof ponto?.payload?.data === 'string' ? ponto.payload.data : '';
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm shadow-lg">
      <p className="text-faint">{formatarDataCurta(data)}</p>
      <p className="tnum font-medium text-fg">{formatBRL(totalCents)}</p>
    </div>
  );
}

export function CurvaPatrimonioChart({ curva }: { curva: PontoCurva[] }) {
  if (curva.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        Precisa de pelo menos 2 snapshots para a curva.
      </p>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={curva} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="data"
            tickFormatter={formatarDataCurta}
            stroke="var(--color-faint)"
            tick={{ fill: 'var(--color-faint)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatarReaisCompacto}
            stroke="var(--color-faint)"
            tick={{ fill: 'var(--color-faint)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<TooltipCurva />} cursor={{ stroke: 'var(--color-border-strong)' }} />
          <Line
            type="monotone"
            dataKey="totalCents"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--color-accent)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
