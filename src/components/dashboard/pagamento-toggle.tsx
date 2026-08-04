/**
 * Checkbox de "pago" com feedback otimista e reversão em falha.
 *
 * Regra que não pode ser violada aqui: isto é RASTREAMENTO, nunca cálculo.
 * O componente não soma, não subtrai e não formata dinheiro — só troca um
 * booleano via server action e mostra o estado. Nenhuma verba muda quando
 * este checkbox muda (SPEC regra 5 / dashboard-tipos `LinhaCustoFixo.pago`,
 * `LinhaParcelada.pago`).
 *
 * Estado visual nunca é só cor (SPEC 11): o texto "Pago"/"Pendente" ao lado
 * do checkbox carrega o significado, a cor é reforço.
 */
'use client';

import * as React from 'react';
import { Checkbox } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Resultado } from '@/actions/resultado';
import { usePodeEscrever } from '@/components/auth/ator-contexto';

export interface PagamentoToggleProps {
  id: string;
  pago: boolean;
  /** Nome do item para associar o estado ao leitor de tela, ex.: "Aluguel". */
  itemLabel: string;
  onToggle: (pago: boolean) => Promise<Resultado<unknown>>;
  className?: string;
}

export function PagamentoToggle({ id, pago, itemLabel, onToggle, className }: PagamentoToggleProps) {
  // UX: não oferecer ao VIEWER um controle que o servidor recusaria. A trava
  // real é `exigirEscrita` no caso de uso (ver TASKS-AUTH §2.3).
  const podeEscrever = usePodeEscrever();
  if (!podeEscrever) return null;
  const [pagoOtimista, setPagoOtimista] = React.useState(pago);
  const [pendente, setPendente] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // O read-model pode revalidar por trás (ex.: outra aba marcou o item) —
  // segue a verdade do servidor quando ela muda por fora deste componente.
  React.useEffect(() => {
    setPagoOtimista(pago);
  }, [pago]);

  const handleChange = React.useCallback(async () => {
    const proximo = !pagoOtimista;
    setPagoOtimista(proximo);
    setErro(null);
    setPendente(true);
    try {
      const resultado = await onToggle(proximo);
      if (!resultado.ok) {
        setPagoOtimista(!proximo);
        setErro(resultado.erro);
      }
    } catch {
      setPagoOtimista(!proximo);
      setErro('Não deu para salvar. Tente de novo.');
    } finally {
      setPendente(false);
    }
  }, [pagoOtimista, onToggle]);

  return (
    <div className={cn('flex flex-col items-end gap-1', className)}>
      <label
        htmlFor={id}
        className="flex min-h-11 min-w-11 cursor-pointer items-center justify-end gap-2 rounded-lg px-2 py-2 hover:bg-surface-2"
      >
        <span
          aria-hidden
          className={cn('text-xs font-medium', pagoOtimista ? 'text-positivo' : 'text-muted')}
        >
          {pagoOtimista ? 'Pago' : 'Pendente'}
        </span>
        <Checkbox
          id={id}
          checked={pagoOtimista}
          aria-checked={pagoOtimista}
          disabled={pendente}
          onChange={handleChange}
        />
        <span className="sr-only">
          {itemLabel} — {pagoOtimista ? 'pago, marcar como pendente' : 'pendente, marcar como pago'}
        </span>
      </label>
      {erro ? (
        <p role="alert" className="max-w-[180px] text-right text-xs text-negativo">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
