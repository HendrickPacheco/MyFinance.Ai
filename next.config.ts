import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // O app é single-user e sempre lê o banco local em tempo real: nada de
  // pré-render estático de páginas que dependem de dados.
  serverExternalPackages: ['@prisma/client', 'prisma'],
  typescript: {
    // O typecheck roda em etapa própria (pnpm typecheck); não duplicar no build.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
