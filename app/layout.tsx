import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { Sidebar } from '@/components/layout/sidebar';
import { criarDeps } from '@/composition';
import { garantirCicloAtual } from '@/application/ciclos';

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
    <html lang="pt-BR">
      <body>
        {/*
          Uma home responsiva (SPEC 11): abaixo de 1024px isto continua sendo
          o app de celular (conteúdo estreito + <Nav /> inferior), intacto.
          A partir de 1024px vira o painel de desktop (sidebar fixa + área de
          conteúdo larga). `children` é renderizado uma única vez — o que
          muda por breakpoint é o layout ao redor, não a árvore de componentes.
        */}
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col lg:mx-0 lg:max-w-none lg:flex-row">
          <Sidebar />
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
