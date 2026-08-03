'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarRange, Scissors, TrendingUp, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITENS = [
  { href: '/', label: 'Hoje', icon: Home },
  { href: '/ciclo', label: 'Ciclo', icon: CalendarRange },
  { href: '/analise', label: 'Análise', icon: Scissors },
  { href: '/patrimonio', label: 'Patrimônio', icon: TrendingUp },
  { href: '/config', label: 'Ajustes', icon: Settings },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur lg:hidden">
      <div className="mx-auto flex w-full max-w-2xl items-stretch justify-between px-2 py-2">
        {ITENS.map((item) => {
          const ativo = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] transition-colors',
                ativo ? 'text-accent' : 'text-faint hover:text-muted',
              )}
              aria-current={ativo ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={ativo ? 2.4 : 1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
