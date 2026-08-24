import type { ReactNode } from 'react';
import { AnaliseTabs } from '@/components/analise/analise-tabs';

/**
 * Chassi da seção Análise: só as abas. Nenhum dado é lido aqui — cada aba tem
 * escopo próprio (`/analise` olha ciclos FECHADOS, `/analise/renda` olha o
 * ciclo ATUAL) e um resumo compartilhado no topo misturaria os dois recortes,
 * que é exatamente o que a seção existe para separar.
 *
 * A tela de corte (`app/analise/page.tsx`) segue intacta: este layout é
 * navegação em volta dela, não mudança nela.
 *
 * A largura é `lg:max-w-3xl` para casar com o container que a tela de corte já
 * tinha. Com `4xl` aqui, as abas ficavam mais largas que o conteúdo logo
 * abaixo delas — a restrição mais estreita de dentro vencia, e as duas
 * desalinhavam na borda. `3xl` também é a largura das outras seções do app
 * (Ciclo, Ajustes), então a navegação não muda de bitola ao trocar de tela.
 */
export default function AnaliseLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full space-y-6 lg:max-w-3xl">
      <AnaliseTabs />
      {children}
    </div>
  );
}
