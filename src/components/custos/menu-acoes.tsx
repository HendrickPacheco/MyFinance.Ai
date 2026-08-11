'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface AcaoMenu {
  id: string;
  label: string;
  icone?: React.ReactNode;
  /** `negativo` pinta em `text-negativo` — reservado para o que apaga de vez. */
  tone?: 'neutral' | 'negativo';
  onSelect: () => void;
}

/**
 * Menu "⋯" de ações de linha (TASKS-CUSTOS §4.1).
 *
 * POR QUE PORTAL COM `position: fixed`, e não `absolute` dentro da linha: a
 * primitiva `Table` envolve a tabela num `div.overflow-x-auto`, e
 * `overflow-x: auto` computa `overflow-y` para `auto` também — um menu
 * posicionado dentro dele seria recortado nas linhas de baixo. É o mesmo
 * motivo pelo qual `TooltipPortal` existe.
 *
 * Acessibilidade (nada aqui é opcional):
 * - `aria-haspopup="menu"` + `aria-expanded` no gatilho.
 * - `role="menu"` / `role="menuitem"`, navegação por ↑↓/Home/End.
 * - Escape fecha e DEVOLVE o foco ao gatilho.
 * - Alvos de 44px.
 */
export function MenuAcoes({ rotulo, acoes }: { rotulo: string; acoes: readonly AcaoMenu[] }) {
  const [aberto, setAberto] = React.useState(false);
  const [rect, setRect] = React.useState<{ top: number; right: number } | null>(null);
  const gatilhoRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const idMenu = React.useId();

  const fechar = React.useCallback(
    (devolverFoco: boolean) => {
      setAberto(false);
      setRect(null);
      if (devolverFoco) gatilhoRef.current?.focus();
    },
    [],
  );

  const abrir = React.useCallback(() => {
    const r = gatilhoRef.current?.getBoundingClientRect();
    if (!r) return;
    setRect({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setAberto(true);
  }, []);

  // Foca o primeiro item assim que o menu aparece — sem isso o teclado
  // continuaria no gatilho e as setas não teriam onde andar.
  React.useEffect(() => {
    if (!aberto) return;
    const primeiro = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    primeiro?.focus();
  }, [aberto]);

  // Rolar ou redimensionar deixaria o menu (fixo na viewport) descolado da
  // linha que o abriu. Fechar é mais honesto do que reposicionar tarde.
  React.useEffect(() => {
    if (!aberto) return;
    const fecharSemFoco = () => fechar(false);
    window.addEventListener('scroll', fecharSemFoco, true);
    window.addEventListener('resize', fecharSemFoco);
    return () => {
      window.removeEventListener('scroll', fecharSemFoco, true);
      window.removeEventListener('resize', fecharSemFoco);
    };
  }, [aberto, fechar]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const itens = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (itens.length === 0) return;
    const atual = itens.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fechar(true);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const proximo =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? itens.length - 1
            : e.key === 'ArrowDown'
              ? (atual + 1) % itens.length
              : (atual - 1 + itens.length) % itens.length;
      itens[proximo]?.focus();
      return;
    }
    if (e.key === 'Tab') {
      // Tab sai do menu: fecha sem prender o foco, que é o comportamento
      // esperado de um menu (ao contrário de um diálogo modal).
      fechar(false);
    }
  };

  return (
    <>
      <button
        ref={gatilhoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        aria-label={rotulo}
        onClick={() => (aberto ? fechar(true) : abrir())}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>

      {aberto && rect
        ? createPortal(
            <>
              {/* Captura o clique fora sem roubar o foco nem virar um item
                  focável — por isso é um div sem tabindex e sem role. */}
              <div
                className="fixed inset-0 z-40"
                onMouseDown={() => fechar(true)}
                aria-hidden="true"
              />
              <div
                ref={menuRef}
                id={idMenu}
                role="menu"
                aria-label={rotulo}
                onKeyDown={handleMenuKeyDown}
                style={{ top: rect.top, right: rect.right }}
                className="fixed z-50 min-w-[15rem] overflow-hidden rounded-xl border border-border-strong bg-surface p-1 shadow-lg"
              >
                {acoes.map((acao) => (
                  <button
                    key={acao.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      fechar(false);
                      acao.onSelect();
                    }}
                    className={cn(
                      'flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors',
                      'hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                      acao.tone === 'negativo' ? 'text-negativo' : 'text-fg',
                    )}
                  >
                    {acao.icone}
                    {acao.label}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
