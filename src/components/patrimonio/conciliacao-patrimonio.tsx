'use client';

/**
 * Conciliação razão × realidade.
 *
 * `Conta.saldoCents` é o que o app calculou a partir de transações e
 * fechamentos; `ItemPatrimonio.valorCents` é o que o dono observou no banco e
 * digitou no snapshot. A diferença NÃO é erro — é gasto não lançado, rendimento
 * ou transferência que o app não viu. Por isso esta tela mostra e pergunta, em
 * vez de sincronizar sozinha: sincronizar em silêncio apagaria o sinal.
 */
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';
import { aceitarRealidade } from '@/actions/config';
import type { DivergenciaConciliacao } from '@/domain/finance';

export function ConciliacaoPatrimonio({
  divergencias,
}: {
  divergencias: DivergenciaConciliacao[];
}) {
  const router = useRouter();
  const [pendenteId, setPendenteId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const aceitar = useCallback(
    (itemId: string) => {
      setErro(null);
      setPendenteId(itemId);
      startTransition(async () => {
        const r = await aceitarRealidade(itemId);
        setPendenteId(null);
        if (r.ok) router.refresh();
        else setErro(r.erro);
      });
    },
    [router],
  );

  if (divergencias.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conciliação pendente</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted">
          O saldo que o app calculou não bate com o que você registrou no último snapshot. A
          diferença costuma ser gasto não lançado ou rendimento — confira antes de aceitar.
        </p>

        <ul className="space-y-3">
          {divergencias.map((d) => {
            const sobra = d.deltaCents > 0;
            return (
              <li
                key={d.itemId}
                className="rounded-xl border border-border bg-surface-2 p-3"
              >
                <p className="font-medium text-fg">{d.nomeItem}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="text-muted">
                    app: <span className="tnum text-fg">{formatBRL(d.razaoCents)}</span>
                  </span>
                  <ArrowRight size={14} className="text-faint" aria-hidden />
                  <span className="text-muted">
                    você: <span className="tnum text-fg">{formatBRL(d.observadoCents)}</span>
                  </span>
                  <span
                    className={`tnum font-medium ${sobra ? 'text-positivo' : 'text-negativo'}`}
                  >
                    {sobra ? '+' : ''}
                    {formatBRL(d.deltaCents)}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={pendenteId === d.itemId}
                  onClick={() => aceitar(d.itemId)}
                >
                  {pendenteId === d.itemId ? 'Ajustando…' : 'Aceitar realidade'}
                </Button>
              </li>
            );
          })}
        </ul>

        {erro ? <p className="mt-3 text-sm text-negativo">{erro}</p> : null}
      </CardContent>
    </Card>
  );
}
