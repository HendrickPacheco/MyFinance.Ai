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

  /**
   * Cabeçalhos ESTÁTICOS de segurança.
   *
   * A `Content-Security-Policy` NÃO está aqui de propósito: ela precisa de um
   * nonce por requisição e é montada em `middleware.ts`. Definir uma CSP também
   * aqui faria o navegador aplicar as DUAS (a interseção), quebrando o nonce.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Redundante com `frame-ancestors` da CSP, mantido para navegador antigo.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // HSTS AUSENTE de propósito (decisão DA-4): o app roda em
          // http://localhost. Mandar HSTS em http é inócuo hoje e vira
          // pegadinha depois. Ligar quando/se houver HTTPS de verdade:
          // { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }
        ],
      },
    ];
  },
};

export default nextConfig;
