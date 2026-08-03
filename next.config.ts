import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Permite rodar uma segunda instância (validação automatizada, CI local) sem
  // atropelar o `.next` do dev server que já está de pé. Dois `next dev` no
  // mesmo distDir regeneram os IDs de Server Action e derrubam o bundle que o
  // navegador já carregou — o erro "Failed to find Server Action".
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // O app é single-user e sempre lê o banco local em tempo real: nada de
  // pré-render estático de páginas que dependem de dados.
  serverExternalPackages: ['@prisma/client', 'prisma'],
  typescript: {
    // O typecheck roda em etapa própria (pnpm typecheck); não duplicar no build.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
