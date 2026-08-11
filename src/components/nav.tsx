'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  CalendarRange,
  Receipt,
  BarChart3,
  Scissors,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/cn';

// Mesma ordem da sidebar do desktop (`layout/sidebar.tsx`): Custos entra logo
// depois de Ciclo, e Projeção logo depois de Custos. Sem esta entrada a seção
// existe só no desktop — foi assim que ela nasceu na Fase 7, e no mobile não
// havia como chegar nela.
const ITENS = [
  { href: '/', label: 'Hoje', icon: Home },
  { href: '/ciclo', label: 'Ciclo', icon: CalendarRange },
  { href: '/custos', label: 'Custos', icon: Receipt },
  { href: '/projecao', label: 'Projeção', icon: BarChart3 },
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
                // `min-w-0` + rótulo truncado: com 7 itens a 375px cada célula
                // fica com ~48px, e "Patrimônio" é mais largo que isso. Sem o
                // truncate o texto empurraria a barra e o BODY DA PÁGINA
                // passaria a rolar na horizontal — o mesmo defeito que o
                // extrato teve na Fase 9. A largura da barra é fixa; o que
                // cede é o rótulo.
                'flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1 text-[10px] tracking-tight transition-colors',
                ativo ? 'text-accent' : 'text-faint hover:text-muted',
              )}
              aria-current={ativo ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={ativo ? 2.4 : 1.8} aria-hidden="true" />
              {/* `title`: o rótulo truncado continua legível no toque longo. */}
              <span className="w-full truncate text-center" title={item.label}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
