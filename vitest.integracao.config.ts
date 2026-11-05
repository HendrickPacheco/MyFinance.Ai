import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Config SEPARADA da suíte padrão (`vitest.config.ts`): estes testes batem no
 * Postgres REAL (`DATABASE_URL` do `.env`) chamando os route handlers de
 * `app/api/agent/v1/**` direto, em vez de fakes em memória. `pnpm test`
 * continua 100% sem banco — só `pnpm test:integracao` roda isto.
 *
 * `singleFork` (sequencial, sem isolamento de worker por arquivo): a mesma
 * conexão Prisma e os singletons de módulo do kernel (rate limiter,
 * idempotência) precisam sobreviver entre testes do mesmo arquivo, e dois
 * arquivos rodando em paralelo contra o mesmo banco só aumentaria o risco de
 * interferência entre as contagens "antes/depois" que cada arquivo confere.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/agent-api/__integracao__/**/*.integracao.test.ts'],
    setupFiles: ['./src/agent-api/__integracao__/setup-env.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
