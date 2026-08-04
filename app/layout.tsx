import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import './globals.css';
import { Nav } from '@/components/nav';
import { Sidebar } from '@/components/layout/sidebar';
import { criarDeps } from '@/composition';
import { garantirCicloAtual } from '@/application/ciclos';
import { estaAutenticado } from '@/domain/auth/ator';
import { PapelProvider } from '@/components/auth/ator-contexto';
import { SIDEBAR_ANTI_FLASH_SCRIPT } from '@/shared/anti-flash-script';

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
 * O conteúdo do script vive em `src/shared/anti-flash-script.ts`; a CSP o
 * autoriza por hash sha256 calculado da mesma constante (ver `middleware.ts`,
 * que explica por que hash e não nonce aqui).
 */

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Gate de autenticação REAL (runtime Node, com banco). O middleware só viu
  // se existia cookie; aqui a sessão é de fato validada. Sem isso, um cookie
  // forjado leria todas as telas.
  const cabecalhos = await headers();
  const pathname = cabecalhos.get('x-pathname') ?? '';
  // Login e cadastro compartilham o mesmo enquadramento sem chassi do app.
  const ROTAS_SEM_CHASSI = ['/login', '/cadastro'];
  const naTelaDeLogin = ROTAS_SEM_CHASSI.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  const deps = await criarDeps();
  if (!estaAutenticado(deps.ator) && !naTelaDeLogin) {
    redirect('/login');
  }

  // Idempotente (SPEC 8): garante que existe um ciclo cobrindo hoje. Nunca
  // bloqueia; se a Config ainda não foi preenchida, as telas orientam.
  try {
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
        {naTelaDeLogin ? (
          // A tela de login não tem sidebar nem navegação: não há para onde
          // navegar antes de entrar, e mostrar o chassi do app sugeriria que há.
          <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-6 sm:px-6">
            {children}
          </main>
        ) : (
        <PapelProvider papel={deps.ator.papel}>
        {/*
          Uma home responsiva (SPEC 11): abaixo de 1024px isto continua sendo
          o app de celular (conteúdo estreito + <Nav /> inferior), intacto.
          A partir de 1024px vira o painel de desktop (sidebar fixa + área de
          conteúdo larga). `children` é renderizado uma única vez — o que
          muda por breakpoint é o layout ao redor, não a árvore de componentes.
        */}
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col lg:mx-0 lg:max-w-none lg:flex-row">
          <Sidebar papel={deps.ator.papel} />
          <div className="flex min-h-dvh flex-1 flex-col">
            <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:mx-auto lg:w-full lg:max-w-[1600px] lg:px-10 lg:py-10">
              {children}
            </main>
            <Nav />
          </div>
        </div>
        </PapelProvider>
        )}
      </body>
    </html>
  );
}
