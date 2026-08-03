'use client';

/**
 * Pizza de gastos variáveis por categoria (o gráfico que a planilha do
 * usuário já tinha). Paleta categórica fixa (ver `cores.ts`) — cor segue a
 * categoria, nunca o rank; 9ª+ categoria dobra em "Outros" cinza neutro.
 */
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipProps } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import type { FatiaCategoria } from '@/application/dashboard-tipos';
import { atribuirCoresCategoricas, COR_OUTROS } from './cores';

const LIMITE_FATIAS = 8;

interface FatiaExibicao {
  chave: string;
  nome: string;
  totalCents: number;
  percentual: number;
  cor: string;
}

function TooltipPizza({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const fatia = payload[0]?.payload as FatiaExibicao | undefined;
  if (!fatia) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm shadow-lg">
      <p className="text-fg">{fatia.nome}</p>
      <p className="tnum font-medium text-fg">{formatBRL(fatia.totalCents)}</p>
      <p className="tnum text-faint">{fatia.percentual.toFixed(1)}%</p>
    </div>
  );
}

export function CategoriasPizza({ categorias }: { categorias: FatiaCategoria[] }) {
  if (categorias.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gastos por categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            titulo="Nenhum gasto no ciclo ainda"
            descricao="Assim que você lançar um gasto variável, a distribuição por categoria aparece aqui."
          />
        </CardContent>
      </Card>
    );
  }

  const comCor = atribuirCoresCategoricas(categorias, (c) => c.categoriaId);

  const principais = comCor.slice(0, LIMITE_FATIAS).map(({ item, cor }) => ({
    chave: item.categoriaId,
    nome: item.nome,
    totalCents: item.totalCents,
    percentual: item.percentual,
    cor,
  }));

  const excedentes = comCor.slice(LIMITE_FATIAS);
  const dados: FatiaExibicao[] =
    excedentes.length > 0
      ? [
          ...principais,
          {
            chave: '__outros__',
            nome: 'Outros',
            totalCents: excedentes.reduce((soma, { item }) => soma + item.totalCents, 0),
            percentual: excedentes.reduce((soma, { item }) => soma + item.percentual, 0),
            cor: COR_OUTROS,
          },
        ]
      : principais;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por categoria</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dados}
                dataKey="totalCents"
                nameKey="nome"
                innerRadius={56}
                outerRadius={96}
                paddingAngle={2}
                strokeWidth={2}
                stroke="var(--color-surface)"
                label={({ percentual }: FatiaExibicao) =>
                  percentual >= 5 ? `${percentual.toFixed(0)}%` : ''
                }
                labelLine={false}
              >
                {dados.map((fatia) => (
                  <Cell key={fatia.chave} fill={fatia.cor} />
                ))}
              </Pie>
              <Tooltip content={<TooltipPizza />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => <span className="text-muted">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
