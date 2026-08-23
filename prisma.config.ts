import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'prisma/config';

/**
 * Substitui o bloco `prisma` do `package.json`, que sai no Prisma 7.
 *
 * Efeito colateral que este arquivo traz: com uma config presente, o CLI do
 * Prisma PARA de carregar `.env` sozinho — `migrate`/`studio` subiriam sem
 * `DATABASE_URL`. `process.loadEnvFile` é nativo (Node 20.6+), então a correção
 * não custa uma dependência nova.
 */
const envPath = path.join(import.meta.dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
