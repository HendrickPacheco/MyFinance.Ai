import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { Sidebar } from '@/components/layout/sidebar';
import { criarDeps } from '@/composition';
import { garantirCicloAtual } from '@/application/ciclos';
import { iaHabilitada } from '@/infrastructure/ia/config-ia';

export const metadata: Metadata = {
  title: 'Quanto posso gastar hoje',
  description: 'Controle financeiro pessoal — um limitador de gastos por ciclo.',
};

export const viewport: Viewport = {
  themeColor: '#0a0c11',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const dynamic = 'force-dynamic';

/**
 * Preferência de UI "sidebar colapsada" (SPEC regra 6: localStorage não é
 * fonte de verdade de dados, mas é o uso correto para preferência de tela).
 * O servidor não tem como saber essa preferência, então uma leitura ingênua
 * no client causaria ou um warning de hidratação (se decidisse a largura via
 * estado do React) ou um flash visível de sidebar expandida encolhendo depois.
 *
 * Solução: um script inline síncrono no <head>, executado ANTES da pintura,
 * que só toca o DOM (atributo `data-sidebar` no <html>) — nunca produz JSX
 * nem participa da árvore que o React hidrata, então não há nada para
 * divergir. O CSS (`app/globals.css`) reage a esse atributo para decidir a
 * largura da sidebar. O componente <Sidebar> (client) mantém seu próprio
 * `useState` para textos/aria (que sempre nasce como "expandido", igual ao
 * servidor) e só sincroniza com a preferência real num `useEffect` após o
 * mount — nesse ponto o CSS já está correto, então a correção de texto/aria é
 * imperceptível e não é um mismatch de hidratação (é só um setState normal
 * depois de montado).
 */
const SIDEBAR_ANTI_FLASH_SCRIPT = `
(function () {
  try {
    var v = window.localStorage.getItem('financial:sidebar-collapsed');
    document.documentElement.setAttribute('data-sidebar', v === '1' ? 'collapsed' : 'expanded');
  } catch (e) {
    // localStorage indisponível (modo privado, etc.) — mantém expandida.
  }
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Idempotente (SPEC 8): garante que existe um ciclo cobrindo hoje. Nunca
  // bloqueia; se a Config ainda não foi preenchida, as telas orientam.
  try {
    const deps = await criarDeps();
    await garantirCicloAtual(deps);
  } catch {
    // Config ausente/incompleta — a tela Hoje/Config cuida do onboarding.
  }

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_ANTI_FLASH_SCRIPT }} />
      </head>
      <body>
        {/*
          Uma home responsiva (SPEC 11): abaixo de 1024px isto continua sendo
          o app de celular (conteúdo estreito + <Nav /> inferior), intacto.
          A partir de 1024px vira o painel de desktop (sidebar fixa + área de
          conteúdo larga). `children` é renderizado uma única vez — o que
          muda por breakpoint é o layout ao redor, não a árvore de componentes.
        */}
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col lg:mx-0 lg:max-w-none lg:flex-row">
          {/* A rota do copiloto só aparece com a camada de IA ligada. */}
          <Sidebar mostrarCopiloto={iaHabilitada()} />
          <div className="flex min-h-dvh flex-1 flex-col">
            <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:mx-auto lg:w-full lg:max-w-[1600px] lg:px-10 lg:py-10">
              {children}
            </main>
            <Nav />
          </div>
        </div>
      </body>
    </html>
  );
}
