'use client';

import { usePathname } from 'next/navigation';
import { Tabs, type TabItem } from '@/components/ui';

/**
 * As duas perguntas da seção Análise, como sub-rotas REAIS (nunca aba em
 * `useState`: o app é Server Components com `revalidatePath`, e estado de
 * cliente aqui quebraria deep-link e botão voltar).
 *
 * São perguntas diferentes de propósito (TASKS-GRAFO §12.1):
 *   "onde eu corto?"          -> só gasto variável dos ciclos fechados
 *   "para onde vai a renda?"  -> a renda inteira do ciclo atual, fixos inclusos
 *
 * Ficam juntas porque o dono chega nas duas pelo mesmo impulso, e a segunda
 * entra aqui em vez de virar um 8º item da `<Nav />` do celular — a barra já
 * trunca rótulo a 375px com 7.
 */
const ABAS: readonly TabItem[] = [
  { href: '/analise', label: 'Corte' },
  { href: '/analise/renda', label: 'Para onde vai a renda' },
];

export function AnaliseTabs() {
  const pathname = usePathname();

  // `/analise` é PREFIXO de `/analise/renda`, e a primitiva `Tabs` marca como
  // ativa toda aba cujo href prefixa a rota — as duas acenderiam juntas. O
  // desempate é aqui: vence a rota mais específica que casa, e é só ela que
  // chega ao `ativo`.
  const ativo =
    [...ABAS]
      .sort((a, b) => b.href.length - a.href.length)
      .find((aba) => pathname === aba.href || pathname.startsWith(`${aba.href}/`))?.href ??
    pathname;

  return <Tabs itens={ABAS} ativo={ativo} ariaLabel="Visões da análise" />;
}
