'use client';

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
} from 'lucide-react';
import { cn } from '@/lib/cn';

const ITENS = [
  { href: '/', label: 'Visão geral', icon: Home },
  { href: '/ciclo', label: 'Ciclo', icon: CalendarRange },
  { href: '/patrimonio', label: 'Patrimônio', icon: TrendingUp },
  { href: '/analise', label: 'Análise', icon: Scissors },
  { href: '/fechar-ciclo', label: 'Fechar ciclo', icon: CheckCircle2 },
  { href: '/config', label: 'Ajustes', icon: Settings },
] as const;

/**
 * Navegação lateral do painel de desktop (SPEC 11: uma home responsiva —
 * abaixo de 1024px o app volta a ser o celular com <Nav /> inferior).
 * Puramente de navegação: não busca dados, não sabe de ciclo/renda/etc.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="px-5 py-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted">
          Controle financeiro
        </p>
      </div>

      <div className="px-4">
        <Link
          href="/ciclo"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
          Lançar gasto
        </Link>
      </div>

      <nav aria-label="Navegação principal" className="mt-6 flex-1 space-y-1 overflow-y-auto px-3 pb-6">
        {ITENS.map((item) => {
          const ativo = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                ativo ? 'bg-surface-2 font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
              aria-current={ativo ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={ativo ? 2.4 : 1.8} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
