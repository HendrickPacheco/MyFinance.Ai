/**
 * Parcelamentos em aberto que caem neste ciclo (SPEC 5.7). Cada linha já é
 * uma competência específica — não confundir com o valor total do contrato.
 *
 * O checkbox "pago" é rastreamento puro (coluna "Pago?" da planilha antiga):
 * a parcela já é uma transação que consome verba desde que foi lançada;
 * marcar como paga aqui não altera gasto nem verba (ver `PagamentoToggle`).
 */
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from '@/components/ui';
import { PagamentoToggle } from './pagamento-toggle';
import { formatBRL } from '@/shared/dinheiro';
import { marcarParcelaPaga } from '@/actions/pagamentos';
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

  const pagas = parcelados.filter((p) => p.pago).length;

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
                <div className="flex shrink-0 items-start gap-3">
                  <div className="text-right">
                    <p className="tnum font-medium text-fg">{formatBRL(linha.valorParcelaCents)}</p>
                    <p className="tnum text-xs text-faint">
                      {linha.parcelaAtual}/{linha.numParcelas}
                    </p>
                  </div>
                  <PagamentoToggle
                    id={`parcela-pago-${linha.transacaoId}`}
                    itemLabel={linha.descricao}
                    pago={linha.pago}
                    onToggle={marcarParcelaPaga.bind(null, linha.transacaoId)}
                  />
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
        <p className="tnum px-5 pb-3 text-xs text-muted">
          {pagas} de {parcelados.length} pagas no ciclo
        </p>
      </CardContent>
    </Card>
  );
}
