/**
 * Provider do Prisma Client (adapter de infraestrutura). Singleton para não
 * abrir múltiplas conexões em dev/hot-reload. Os repositories concretos
 * (Fase 2+) usam este cliente; o domínio nunca o importa.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Adapta um cliente de transação INTERATIVA (`tx` do callback de
 * `prisma.$transaction(async (tx) => ...)`) para a forma `PrismaClient`,
 * porque alguns repositórios chamam `this.db.$transaction(...)`
 * internamente (`prisma-repositories.ts` ~L483/~L572/~L898,
 * `prisma-conversa.ts` L88) — operação que `tx` não tem, já que ele É a
 * transação, não o cliente raiz que abre uma.
 *
 * A API do agente (`src/agent-api/`) constrói todo repositório com o `tx` da
 * rota de escrita (para a operação inteira ser atômica), e por isso precisa
 * deste adapter: sem ele, qualquer repositório que agrupe suas próprias
 * operações num `$transaction` quebraria em runtime dentro de uma escrita do
 * agente.
 *
 *  - Forma ARRAY `$transaction([p1, p2, ...])`: cada `pN` já foi construído
 *    chamando `tx.modelo.operacao(...)` — ou seja, já está amarrado a ESTA
 *    transação e já está em voo. `Promise.all` só aguarda todas na mesma
 *    ordem, sem abrir nada novo (Postgres serializa as queries da mesma
 *    transação na mesma conexão).
 *  - Forma CALLBACK `$transaction(async (inner) => ...)`: chama a função
 *    direto com `tx` — não existe transação aninhada de verdade aqui, só a
 *    MESMA transação que já está em curso.
 *
 * ÚNICO lugar do código com este cast — qualquer chamada a `.$transaction`
 * fora das duas formas acima (ex.: opções `{ isolationLevel }`) não é
 * suportada por este adapter.
 */
export function clienteEmTransacao(tx: Prisma.TransactionClient): PrismaClient {
  const transacaoAdaptada = ((
    arg: unknown[] | ((inner: Prisma.TransactionClient) => Promise<unknown>),
  ) => {
    if (typeof arg === 'function') return arg(tx);
    return Promise.all(arg as Promise<unknown>[]);
  }) as PrismaClient['$transaction'];

  return { ...tx, $transaction: transacaoAdaptada } as unknown as PrismaClient;
}
