/**
 * Parcelamentos em aberto que caem neste ciclo (SPEC 5.7). Cada linha já é
 * uma competência específica — não confundir com o valor total do contrato.
 */
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import type { LinhaParcelada } from '@/application/dashboard-tipos';

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

export function ParceladosLista({
  parcelados,
  parceladosTotalCents,
}: {
  parcelados: LinhaParcelada[];
  parceladosTotalCents: number;
}) {
  if (parcelados.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Parcelamentos do ciclo</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            titulo="Nenhuma parcela neste ciclo"
            descricao="Compras parceladas lançadas aparecem aqui, uma linha por competência."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parcelamentos do ciclo</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {parcelados.map((linha) => (
            <li key={`${linha.parcelamentoId}-${linha.data}`} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{linha.descricao}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {linha.categoriaNome ?? 'sem categoria'} · {formatarDataCurta(linha.data)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum font-medium text-fg">{formatBRL(linha.valorParcelaCents)}</p>
                  <p className="tnum text-xs text-faint">
                    {linha.parcelaAtual}/{linha.numParcelas}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-sm font-medium text-fg">Total parcelado no ciclo</span>
          <span className="tnum text-lg font-semibold text-fg">
            {formatBRL(parceladosTotalCents)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
