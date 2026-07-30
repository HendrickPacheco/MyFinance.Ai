'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { formatBRL } from '@/shared/dinheiro';

/**
 * Passo 5: recalibração de meta — o mecanismo de progresso do app. Só se
 * aplica se `metaSugeridaCents` existir (dois ciclos seguidos com folga).
 */
export function PassoMeta({
  metaAtualCents,
  metaSugeridaCents,
  aceitar,
  onChangeAceitar,
}: {
  metaAtualCents: number;
  metaSugeridaCents: number | null;
  aceitar: boolean;
  onChangeAceitar: (aceitar: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>5. Recalibrar meta de poupança</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {metaSugeridaCents == null ? (
          <p className="text-sm text-muted">
            Sem recalibração desta vez — este e o ciclo anterior não sobraram com folga
            suficiente para sugerir um novo alvo.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Este ciclo e o anterior fecharam com folga. Você pode subir sua meta de poupança:
            </p>
            <div className="tnum flex items-center gap-3 text-lg">
              <span className="text-faint line-through">{formatBRL(metaAtualCents)}</span>
              <span className="text-fg">&rarr;</span>
              <span className="font-semibold text-positivo">{formatBRL(metaSugeridaCents)}</span>
            </div>
            <label className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-surface-2 px-4">
              <input
                type="checkbox"
                checked={aceitar}
                onChange={(evento) => onChangeAceitar(evento.target.checked)}
                className="h-5 w-5 accent-accent"
              />
              <span className="text-sm text-fg">Aceitar a nova meta de poupança</span>
            </label>
          </>
        )}
      </CardContent>
    </Card>
  );
}
