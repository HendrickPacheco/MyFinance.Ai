'use client';

import * as React from 'react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/shared/dinheiro';

/** R$ 999.999,99 — mesmo teto do lançamento rápido e do painel de lançamento. */
const TETO_CENTAVOS = 99_999_999;

const TECLAS_PASSAGEM = [
  'Tab',
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'Enter',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
] as const;

export interface CampoDinheiroProps {
  id: string;
  /** Valor em CENTAVOS (Int). Nunca string, nunca decimal. */
  valorCents: number;
  onChange: (centavos: number) => void;
  disabled?: boolean;
  className?: string;
  'aria-describedby'?: string;
}

/**
 * Campo monetário por ACUMULAÇÃO DE CENTAVOS (TASKS-CUSTOS §5, débito 4).
 *
 * O outro padrão que existe no app — `<input>` de texto livre reparseado com
 * `parseBRL` — aceita "12,3", "R$ 12.3.4" e ".", e cada um desses vira um
 * número diferente do que o dono achou que digitou. Aqui o estado É o inteiro
 * em centavos: cada dígito faz `c * 10 + d`, Backspace faz `floor(c / 10)`, e
 * o texto exibido é sempre `formatBRL` do estado. Não existe entrada
 * ambígua porque não existe texto livre.
 *
 * Teclas de navegação nunca são bloqueadas — Tab, Enter e setas seguem
 * funcionando, senão o campo viraria uma armadilha para quem usa teclado.
 */
export function CampoDinheiro({
  id,
  valorCents,
  onChange,
  disabled = false,
  className,
  'aria-describedby': ariaDescribedBy,
}: CampoDinheiroProps) {
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((TECLAS_PASSAGEM as readonly string[]).includes(e.key)) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onChange(Math.floor(valorCents / 10));
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        onChange(Math.min(valorCents * 10 + Number(e.key), TETO_CENTAVOS));
        return;
      }
      // Qualquer outra tecla (vírgula, ponto, letra) é ignorada: aceitá-la
      // corromperia o texto formatado sem mudar o valor.
      e.preventDefault();
    },
    [onChange, valorCents],
  );

  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      value={formatBRL(valorCents)}
      onKeyDown={handleKeyDown}
      onChange={() => {
        /* controlado só por onKeyDown — ver o cabeçalho */
      }}
      aria-describedby={ariaDescribedBy}
      className={cn('tnum text-right', valorCents > 0 ? 'text-fg' : 'text-faint', className)}
    />
  );
}
