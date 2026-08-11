'use client';

import { Badge } from '@/components/ui';
import { PagamentoToggle } from '@/components/dashboard/pagamento-toggle';
import { marcarParcelaPaga } from '@/actions/pagamentos';
import type { ParcelaResumo } from '@/application/parcelamentos';
import { formatBRL } from '@/shared/dinheiro';
import { formatarDataCurta, formatarMesAno } from '@/shared/data';

/**
 * O cronograma de uma compra parcelada — o que a linha expandida revela.
 *
 * É a MESMA lista nas duas superfícies (tabela do desktop e cards do mobile),
 * pelo mesmo motivo de `acoesDoCusto` na Fase 7: o que uma parcela é e o que
 * dá para fazer com ela não pode depender da largura da tela.
 *
 * O `PagamentoToggle` é o existente, sem alteração: marcar pago é
 * RASTREAMENTO, não cálculo — a parcela já consome o teto desde que foi
 * lançada (D-11), e este checkbox não move verba nenhuma.
 */
export function CronogramaParcelas({
  descricao,
  parcelas,
}: {
  descricao: string;
  parcelas: readonly ParcelaResumo[];
}) {
  if (parcelas.length === 0) {
    return (
      <p className="py-3 text-sm text-muted">
        Nenhuma parcela viva — as futuras foram canceladas no encerramento.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {parcelas.map((p) => (
        <li key={p.transacaoId} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="tnum text-sm text-fg">
              {p.parcelaNum ?? '—'} · {formatarMesAno(p.data)}
            </p>
            <p className="tnum text-xs text-faint">
              vence {formatarDataCurta(p.data)}
              {p.emCicloFechado ? ' · ciclo fechado' : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {p.emCicloFechado ? (
              <Badge tone="neutral">Congelada</Badge>
            ) : null}
            <span className="tnum text-sm text-fg">{formatBRL(p.valorCents)}</span>
            <PagamentoToggle
              id={`parcela-pago-${p.transacaoId}`}
              itemLabel={`${descricao}, parcela ${p.parcelaNum ?? '?'}`}
              pago={p.pago}
              onToggle={marcarParcelaPaga.bind(null, p.transacaoId)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
