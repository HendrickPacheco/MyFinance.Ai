'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';

const CHAVE_TEMA = 'financial:tema';

/**
 * Alterna claro/escuro. A fonte visual é `data-theme` no <html> (definido
 * antes da pintura pelo script anti-flash); localStorage é só preferência de UI.
 * Ambos os ícones ficam no DOM e o CSS escolhe qual mostrar, evitando mismatch
 * de hidratação (o servidor não sabe o tema).
 */
export function TemaToggle({ className }: { className?: string }) {
  const alternar = React.useCallback(() => {
    const raiz = document.documentElement;
    const proximo = raiz.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    raiz.setAttribute('data-theme', proximo);
    try {
      window.localStorage.setItem(CHAVE_TEMA, proximo);
    } catch {
      // localStorage indisponível — a preferência só não persiste.
    }
  }, []);

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Alternar tema claro/escuro"
      title="Alternar tema"
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      <Moon size={18} aria-hidden="true" className="block [html[data-theme=dark]_&]:hidden" />
      <Sun size={18} aria-hidden="true" className="hidden [html[data-theme=dark]_&]:block" />
    </button>
  );
}
