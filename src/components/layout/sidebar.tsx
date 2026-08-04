'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  CalendarRange,
  Scissors,
  TrendingUp,
  Settings,
  CheckCircle2,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, TooltipPortal, type TooltipAnchorRect } from '@/components/ui';
import { EVENTO_ABRIR_LANCAMENTO } from '@/components/dashboard/lancamento-painel';

interface ItemSidebar {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ITENS: readonly ItemSidebar[] = [
  { href: '/', label: 'Visão geral', icon: Home },
  { href: '/ciclo', label: 'Ciclo', icon: CalendarRange },
  { href: '/patrimonio', label: 'Patrimônio', icon: TrendingUp },
  { href: '/analise', label: 'Análise', icon: Scissors },
  { href: '/fechar-ciclo', label: 'Fechar ciclo', icon: CheckCircle2 },
  { href: '/config', label: 'Ajustes', icon: Settings },
];

/** Entra depois de "Ciclo" quando a camada de IA está ligada. */
const ITEM_COPILOTO: ItemSidebar = { href: '/copiloto', label: 'Copiloto', icon: Sparkles };

const CHAVE_PREFERENCIA = 'financial:sidebar-collapsed';

/**
 * Mostra/esconde um `TooltipPortal` ancorado a um elemento, só quando
 * `ativo` (ou seja, só com a sidebar colapsada — com ela expandida o rótulo
 * já está visível, um tooltip seria redundante/barulhento). Cada item da
 * sidebar chama este hook no topo do seu próprio componente — nunca dentro
 * de um `.map()` diretamente, para respeitar as regras de hooks.
 */
function useTooltipAncora(ativo: boolean) {
  const [rect, setRect] = React.useState<TooltipAnchorRect | null>(null);

  const mostrar = React.useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      if (!ativo) return;
      const r = e.currentTarget.getBoundingClientRect();
      setRect({ top: r.top + r.height / 2, right: r.right });
    },
    [ativo],
  );
  const esconder = React.useCallback(() => setRect(null), []);

  // Se a sidebar expandir enquanto o tooltip está visível (ex.: usuário
  // alterna com o mouse ainda em cima do botão de toggle), garante que ele
  // não fique "grudado" na tela.
  React.useEffect(() => {
    if (!ativo) setRect(null);
  }, [ativo]);

  return { rect, mostrar, esconder };
}

function ToggleSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { rect, mostrar, esconder } = useTooltipAncora(collapsed);
  const rotulo = collapsed ? 'Expandir menu' : 'Recolher menu';

  return (
    <div className="px-3">
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={mostrar}
        onMouseLeave={esconder}
        onFocus={mostrar}
        onBlur={esconder}
        aria-expanded={!collapsed}
        aria-label={rotulo}
        className={cn(
          'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm',
          'text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        )}
      >
        {collapsed ? (
          <PanelLeftOpen size={18} strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <PanelLeftClose size={18} strokeWidth={1.8} aria-hidden="true" />
        )}
        <span className="sidebar-label">{rotulo}</span>
      </button>
      <TooltipPortal label={rotulo} anchorRect={rect} />
    </div>
  );
}

function BotaoLancarGasto({ collapsed }: { collapsed: boolean }) {
  const { rect, mostrar, esconder } = useTooltipAncora(collapsed);

  return (
    <div className="px-4 pt-3">
      <Button
        type="button"
        className="w-full gap-2"
        aria-label="Lançar gasto (atalho: tecla N)"
        onMouseEnter={mostrar}
        onMouseLeave={esconder}
        onFocus={mostrar}
        onBlur={esconder}
        onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_LANCAMENTO))}
      >
        <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
        <span className="sidebar-label flex flex-1 items-center gap-2">
          Lançar gasto
          <kbd
            aria-hidden="true"
            className="ml-auto rounded border border-accent-fg/30 bg-black/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-fg/80"
          >
            N
          </kbd>
        </span>
      </Button>
      <TooltipPortal label="Lançar gasto (N)" anchorRect={rect} />
    </div>
  );
}

function SidebarNavLink({
  href,
  label,
  icon: Icon,
  ativo,
  collapsed,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  ativo: boolean;
  collapsed: boolean;
}) {
  const { rect, mostrar, esconder } = useTooltipAncora(collapsed);

  return (
    <>
      <Link
        href={href}
        aria-label={label}
        onMouseEnter={mostrar}
        onMouseLeave={esconder}
        onFocus={mostrar}
        onBlur={esconder}
        className={cn(
          'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm transition-colors',
          ativo ? 'bg-surface-2 font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
        )}
        aria-current={ativo ? 'page' : undefined}
      >
        <Icon size={18} strokeWidth={ativo ? 2.4 : 1.8} aria-hidden="true" />
        <span className="sidebar-label">{label}</span>
      </Link>
      <TooltipPortal label={label} anchorRect={rect} />
    </>
  );
}

/**
 * Navegação lateral do painel de desktop (SPEC 11: uma home responsiva —
 * abaixo de 1024px o app volta a ser o celular com <Nav /> inferior).
 * Puramente de navegação: não busca dados, não sabe de ciclo/renda/etc.
 *
 * Colapsável: a LARGURA visual é decidida por CSS reagindo ao atributo
 * `data-sidebar` no <html> (ver `app/layout.tsx` + `app/globals.css`), não
 * por este estado do React — isso evita flash/mismatch de hidratação. Este
 * `collapsed` só controla texto/aria/tooltip, que nascem sempre "expandido"
 * (igual ao servidor) e se corrigem num efeito pós-mount se a preferência
 * salva for outra — correção imperceptível, não é warning de hidratação.
 */
/**
 * `mostrarCopiloto` vem do servidor (app/layout.tsx), porque `IA_HABILITADA`
 * é variável de ambiente e este componente é client — ele não tem como ler.
 */
export function Sidebar({ mostrarCopiloto = false }: { mostrarCopiloto?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  const itens = React.useMemo(
    () =>
      mostrarCopiloto
        ? [...ITENS.slice(0, 2), ITEM_COPILOTO, ...ITENS.slice(2)]
        : ITENS,
    [mostrarCopiloto],
  );

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(CHAVE_PREFERENCIA) === '1');
    } catch {
      // localStorage indisponível — mantém expandida.
    }
  }, []);

  const alternar = React.useCallback(() => {
    setCollapsed((atual) => {
      const proximo = !atual;
      try {
        document.documentElement.setAttribute('data-sidebar', proximo ? 'collapsed' : 'expanded');
        window.localStorage.setItem(CHAVE_PREFERENCIA, proximo ? '1' : '0');
      } catch {
        // localStorage indisponível — a preferência só não persiste entre sessões.
      }
      return proximo;
    });
    // O nó do botão de alternância não é desmontado nem trocado ao colapsar
    // (só muda de rótulo/ícone) — o foco permanece nele naturalmente, sem
    // precisar mover foco manualmente.
  }, []);

  return (
    <aside className="app-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="px-5 py-6">
        <p className="sidebar-label truncate text-sm font-semibold uppercase tracking-widest text-muted">
          Controle financeiro
        </p>
      </div>

      <ToggleSidebar collapsed={collapsed} onToggle={alternar} />
      <BotaoLancarGasto collapsed={collapsed} />

      <nav aria-label="Navegação principal" className="mt-6 flex-1 space-y-1 overflow-y-auto px-3 pb-6">
        {itens.map((item) => {
          const ativo = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <SidebarNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              ativo={ativo}
              collapsed={collapsed}
            />
          );
        })}
      </nav>
    </aside>
  );
}
