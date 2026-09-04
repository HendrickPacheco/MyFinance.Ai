'use client';

/**
 * Dois gráficos de evolução do histórico: renda x gastos por mês (barras) e
 * patrimônio ao longo do tempo (linha). Eixo x sempre em `estado.serie`
 * (mais antigo -> mais novo, ver `historico-tipos.ts`).
 *
 * Patrimônio usa `connectNulls`: um mês sem snapshot (`patrimonioFimCents:
 * null`) é uma LACUNA, não um zero — zerar mentiria sobre um mês em que
 * ninguém tirou o snapshot (D-14).
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { PALETA_CATEGORICA } from '@/components/dashboard/cores';
import type { EstadoHistorico, MesHistorico } from '@/application/historico-tipos';

const COR_RENDA = PALETA_CATEGORICA[0]; // azul
const COR_GASTO = PALETA_CATEGORICA[1]; // laranja
const COR_PATRIMONIO = PALETA_CATEGORICA[2]; // aqua

function formatarReaisCompacto(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

function TooltipRendaGasto({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm shadow-lg">
      <p className="text-faint">{label}</p>
      {payload.map((entrada) => (
        <p key={entrada.dataKey} className="tnum font-medium text-fg">
          {entrada.name}: {formatBRL(typeof entrada.value === 'number' ? entrada.value : 0)}
        </p>
      ))}
    </div>
  );
}

function TooltipPatrimonio({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const ponto = payload[0];
  if (typeof ponto?.value !== 'number') return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm shadow-lg">
      <p className="text-faint">{label}</p>
      <p className="tnum font-medium text-fg">{formatBRL(ponto.value)}</p>
    </div>
  );
}

export function GraficosHistorico({ estado }: { estado: EstadoHistorico }) {
  const dados = estado.serie as MesHistorico[];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Renda x gastos por mês</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="rotulo"
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
                <Tooltip content={<TooltipRendaGasto />} cursor={{ fill: 'var(--color-surface-2)' }} />
                <Bar dataKey="rendaConsideradaCents" name="Renda" fill={COR_RENDA} radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastoTotalCents" name="Gasto total" fill={COR_GASTO} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patrimônio ao longo do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="rotulo"
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
                <Tooltip content={<TooltipPatrimonio />} cursor={{ stroke: 'var(--color-border-strong)' }} />
                <Line
                  type="monotone"
                  dataKey="patrimonioFimCents"
                  name="Patrimônio"
                  stroke={COR_PATRIMONIO}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: COR_PATRIMONIO, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
