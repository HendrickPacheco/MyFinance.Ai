import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
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
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
          <main className="flex-1 px-4 pb-28 pt-6 sm:px-6">{children}</main>
          <Nav />
        </div>
      </body>
    </html>
  );
}
