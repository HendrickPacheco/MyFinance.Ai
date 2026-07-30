/**
 * Provider do Prisma Client (adapter de infraestrutura). Singleton para não
 * abrir múltiplas conexões em dev/hot-reload. Os repositories concretos
 * (Fase 2+) usam este cliente; o domínio nunca o importa.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
