'use client';

/**
 * Input de dinheiro: mantém o texto digitado em estado local e só propaga
 * centavos para o pai quando o parse (`parseBRL`) tem sucesso. No blur,
 * reformata para o padrão BRL a partir do último valor válido — o kernel de
 * dinheiro (src/shared/dinheiro.ts) é a única fonte de parsing/formatação.
 */
import { useState, type FocusEvent, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui';
import { formatBRL, parseBRL } from '@/shared/dinheiro';

interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  valueCents: number;
  onChangeCents: (cents: number) => void;
}

export function MoneyInput({ valueCents, onChangeCents, onBlur, ...props }: MoneyInputProps) {
  const [texto, setTexto] = useState(() => formatBRL(valueCents));

  const handleBlur = (evento: FocusEvent<HTMLInputElement>) => {
    setTexto(formatBRL(valueCents));
    onBlur?.(evento);
  };

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={(evento) => {
        const novoTexto = evento.target.value;
        setTexto(novoTexto);
        try {
          onChangeCents(parseBRL(novoTexto));
        } catch {
          // entrada incompleta (ex.: "1.234," enquanto o usuário digita) — aguarda.
        }
      }}
      onBlur={handleBlur}
    />
  );
}
