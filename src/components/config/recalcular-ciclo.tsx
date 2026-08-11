'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button, ConfirmInline } from '@/components/ui';
import { recalcularCicloAtual } from '@/actions/ciclos';
import type { PreviaRecalculo } from '@/application/ciclos';
import { formatBRL } from '@/shared/dinheiro';
import { formatarDataCurta } from '@/shared/data';

export interface BotaoRecalcularCicloProps {
  /**
   * O delta calculado NO SERVIDOR: quanto a verba do ciclo é hoje e quanto
   * passaria a ser. `null` quando não há ciclo aberto — aí não há o que
   * recalcular e o botão não aparece.
   *
   * Estimar isso no cliente estava fora de cogitação: o cálculo depende de
   * custos, provisões e meta de poupança vigentes, que a tela não tem inteiros
   * — um número plausível e errado aqui é pior que nenhum número.
   */
  previa: PreviaRecalculo | null;
  /** Variante visual do gatilho. `outline` no card de aviso, `ghost` no banner. */
  variant?: 'outline' | 'ghost';
  className?: string;
}

/**
 * Gatilho + confirmação de "recalcular ciclo atual" (SPEC 5.2). A confirmação
 * mostra o valor de ANTES e o de DEPOIS (TASKS-CUSTOS §4.3 item 3) — é isso
 * que transforma "recalcular" de ação abstrata em decisão informada.
 */
export function BotaoRecalcularCiclo({
  previa,
  variant = 'outline',
  className,
}: BotaoRecalcularCicloProps) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!previa) return null;

  const periodo = `${formatarDataCurta(previa.inicio)} – ${formatarDataCurta(previa.fim)}`;
  const semMudanca = previa.verbaAtualCents === previa.verbaRecalculadaCents;

  const executar = () => {
    startTransition(async () => {
      const r = await recalcularCicloAtual();
      setMsg(
        r.ok
          ? `Ciclo recalculado. A verba de ${periodo} agora é ${formatBRL(r.data.verbaVariavelCents)}.`
          : r.erro,
      );
      setConfirmar(false);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className={className}>
      {!confirmar ? (
        <Button variant={variant} size="sm" onClick={() => setConfirmar(true)}>
          Recalcular ciclo atual…
        </Button>
      ) : (
        <ConfirmInline
          titulo={
            semMudanca
              ? `A verba de ${periodo} continuaria em ${formatBRL(previa.verbaAtualCents)}.`
              : `A verba de ${periodo} passa de ${formatBRL(previa.verbaAtualCents)} para ${formatBRL(previa.verbaRecalculadaCents)}.`
          }
          descricao={
            semMudanca
              ? 'Os parâmetros de hoje dão no mesmo número que já está congelado — recalcular não mudaria nada.'
              : 'O seu teto de hoje muda na mesma hora. Os gastos já lançados não mudam.'
          }
          confirmLabel={
            semMudanca ? 'Recalcular assim mesmo' : `Passar para ${formatBRL(previa.verbaRecalculadaCents)}`
          }
          tone="neutral"
          pendente={pending}
          onConfirm={executar}
          onCancel={() => setConfirmar(false)}
        />
      )}
      {msg ? (
        <p role="status" aria-live="polite" className="mt-2 text-sm text-positivo">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Card de "recalcular ciclo atual" da tela de Configuração. Mantém o tom de
 * atenção porque ali a ação aparece isolada, sem o contexto do banner de
 * congelamento de `/custos/fixos`.
 */
export function RecalcularCiclo({ previa }: { previa: PreviaRecalculo | null }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-atencao/40 bg-atencao/5 p-5">
      <div className="flex items-center gap-2 text-atencao">
        <AlertTriangle size={16} aria-hidden />
        <p className="text-sm font-medium">Recalcular o ciclo atual</p>
      </div>
      <p className="mt-2 text-sm text-muted">
        Normalmente as mudanças só valem no próximo ciclo. Recalcular reaplica os parâmetros atuais
        ao ciclo em andamento e <strong>reescreve o histórico dele</strong> — o teto de hoje pode
        mudar.
      </p>
      <BotaoRecalcularCiclo previa={previa} className="mt-3" />
    </div>
  );
}
