/**
 * Pago/pendente dos custos fixos no ciclo atual. RASTREAMENTO puro: o valor já
 * foi descontado da verba quando o ciclo nasceu (marcar não recalcula nada).
 * Mora aqui desde que a home do protótipo só mostra os fixos dos próximos 7 dias.
 */
import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { PagamentoToggle } from '@/components/dashboard/pagamento-toggle';
import { marcarCustoFixoPago } from '@/actions/pagamentos';
import { formatBRL } from '@/shared/dinheiro';
import type { LinhaCustoFixo } from '@/application/dashboard-tipos';
import type { DivergenciaCongelado } from '@/domain/finance';

export function FixosPagamentoCiclo({
  custosFixos,
  fixosTotalCents,
  divergencia,
}: {
  custosFixos: readonly LinhaCustoFixo[];
  fixosTotalCents: number;
  divergencia: DivergenciaCongelado;
}) {
  if (custosFixos.length === 0) return null;
  const pagos = custosFixos.filter((c) => c.pago).length;
  const dif = divergencia.diferencaCents;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagamento dos fixos no ciclo</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {custosFixos.map((custo) => (
            <li
              key={custo.custoFixoId}
              className="flex items-center justify-between gap-3 py-1 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-fg">{custo.nome}</span>
                  {custo.vencido ? <Badge tone="atencao">venceu, não pago</Badge> : null}
                </div>
                <p className="tnum mt-0.5 text-xs text-muted">
                  dia {custo.diaVencimento} · {formatBRL(custo.valorCents)}
                </p>
              </div>
              <PagamentoToggle
                id={`fixo-pago-${custo.custoFixoId}`}
                itemLabel={custo.nome}
                pago={custo.pago}
                onToggle={marcarCustoFixoPago.bind(null, custo.custoFixoId)}
              />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-medium text-fg">
            Total fixos{dif !== 0 ? ' · congelado neste ciclo' : ''}
          </span>
          <span className="tnum text-lg font-semibold text-fg">{formatBRL(fixosTotalCents)}</span>
        </div>
        {dif !== 0 ? (
          <p className="tnum mt-1 text-xs text-muted" title={divergencia.motivoDiferenca ?? undefined}>
            Cadastro de hoje: {formatBRL(divergencia.cadastradoHojeCents)} · {dif > 0 ? '+' : '−'}
            {formatBRL(Math.abs(dif))} que só entra no{' '}
            <Link href="/ciclo" className="underline underline-offset-2">
              próximo ciclo (ou recalcule o atual)
            </Link>
          </p>
        ) : null}
        <p className="tnum mt-1 text-xs text-muted">
          {pagos} de {custosFixos.length} pagos no ciclo
        </p>
      </CardContent>
    </Card>
  );
}
