/**
 * `setupFiles` de `vitest.integracao.config.ts`: carrega `.env` (DATABASE_URL
 * real) ANTES de qualquer teste importar `@/composition`/`@/infrastructure/
 * persistence/prisma` — o `PrismaClient` lê `process.env.DATABASE_URL` na
 * hora em que o módulo é construído, então a ordem importa.
 *
 * `process.loadEnvFile` é do Node 20.6+/22 (o repo já pede Node 22 via
 * `@types/node`) — evita adicionar `dotenv` só para isto (não está instalado).
 */
process.loadEnvFile?.(new URL('../../../.env', import.meta.url));
