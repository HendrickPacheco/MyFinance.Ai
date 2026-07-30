'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import type { Transacao } from '@/domain/model/entidades';

/** Passo 2: só leitura/aviso — não bloqueia o fechamento. */
export function TransacoesSemCategoria({ transacoes }: { transacoes: readonly Transacao[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Transações sem categoria</CardTitle>
      </CardHeader>
      <CardContent className={transacoes.length === 0 ? undefined : 'p-0'}>
        {transacoes.length === 0 ? (
          <p className="text-sm text-muted">Tudo categorizado neste ciclo.</p>
        ) : (
          <>
            <p className="px-5 pb-3 text-sm text-muted">
              {transacoes.length} {transacoes.length === 1 ? 'despesa' : 'despesas'} sem
              categoria. Isso não bloqueia o fechamento, mas prejudica a análise de corte.
            </p>
            <ul className="divide-y divide-border">
              {transacoes.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{t.descricao ?? 'Sem descrição'}</p>
                    <p className="text-xs text-faint">{formatarDataCurta(t.data)}</p>
                  </div>
                  <span className="tnum shrink-0 text-sm font-medium text-fg">
                    {formatBRL(t.valorCents)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}
