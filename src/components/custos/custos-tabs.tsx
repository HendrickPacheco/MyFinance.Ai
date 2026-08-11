'use client';

import { usePathname } from 'next/navigation';
import { Tabs, type TabItem } from '@/components/ui';

/**
 * Sub-rotas REAIS apresentadas como abas — nunca aba em `useState`. O app é
 * 100% Server Components com `revalidatePath`; estado de cliente aqui quebraria
 * deep-link e botão voltar, e obrigaria a carregar os três datasets sempre.
 *
 * Cliente só por causa do `usePathname`: a primitiva `Tabs` precisa saber qual
 * rota está ativa, e um layout de servidor não recebe o pathname por props.
 */
const ABAS: readonly TabItem[] = [
  { href: '/custos/fixos', label: 'Fixos e provisões' },
  { href: '/custos/parcelados', label: 'Parcelados' },
  { href: '/custos/variaveis', label: 'Variáveis' },
];

export function CustosTabs() {
  const pathname = usePathname();
  return <Tabs itens={ABAS} ativo={pathname} ariaLabel="Tipos de custo" />;
}
