'use client';

/**
 * Saídas do ciclo por método de pagamento (a tabela da planilha). Cor por
 * slot fixo do enum `MetodoPagamento` — identidade nunca depende do rank de
 * valor, e o rótulo do próprio eixo já carrega a identidade (não só a cor).
 */
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import type { FatiaMetodo } from '@/application/dashboard-tipos';
import { COR_METODO, COR_OUTROS, LABEL_METODO } from './cores';

interface LinhaMetodo {
  chave: string;
  rotulo: string;
  totalCents: number;
  percentual: number;
  cor: string;
}

function TooltipMetodo({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const linha = payload[0]?.payload as LinhaMetodo | undefined;
  if (!linha) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm shadow-lg">
      <p className="text-fg">{linha.rotulo}</p>
      <p className="tnum font-medium text-fg">{formatBRL(linha.totalCents)}</p>
      <p className="tnum text-faint">{linha.percentual.toFixed(1)}%</p>
    </div>
  );
}

export function MetodosPagamento({ metodos }: { metodos: FatiaMetodo[] }) {
  if (metodos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saídas por método</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            titulo="Sem saídas no ciclo ainda"
            descricao="As saídas lançadas com um método de pagamento aparecem aqui, agrupadas."
          />
        </CardContent>
      </Card>
    );
  }

  const dados: LinhaMetodo[] = metodos.map((m) => ({
    chave: m.metodo ?? '__sem_metodo__',
    rotulo: m.metodo ? LABEL_METODO[m.metodo] : 'Sem método',
    totalCents: m.totalCents,
    percentual: m.percentual,
    cor: m.metodo ? COR_METODO[m.metodo] : COR_OUTROS,
  }));

  const altura = Math.max(dados.length * 44, 120);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saídas por método</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: altura }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--color-border)" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatBRL(v)}
                stroke="var(--color-faint)"
                tick={{ fill: 'var(--color-faint)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="rotulo"
                stroke="var(--color-faint)"
                tick={{ fill: 'var(--color-fg)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={88}
              />
              <Tooltip content={<TooltipMetodo />} cursor={{ fill: 'var(--color-surface-2)' }} />
              <Bar dataKey="totalCents" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {dados.map((linha) => (
                  <Cell key={linha.chave} fill={linha.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
