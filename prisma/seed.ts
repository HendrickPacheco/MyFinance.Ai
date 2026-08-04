/**
 * Seed do workspace do OWNER: Config, contas base (os 4 buckets) e as
 * categorias BR. Idempotente — pode rodar várias vezes sem duplicar.
 *
 * Depois da virada multi-tenant, a semeadura é POR DONO e o conteúdo vive em
 * `src/infrastructure/onboarding.ts`, compartilhado com o caminho automático
 * (usuário novo é semeado no primeiro acesso). Este script continua existindo
 * para semear explicitamente o dono principal a partir da linha de comando.
 *
 * Valores monetários entram como placeholders (0); o usuário preenche renda,
 * dia de recebimento e meta na tela de Configuração.
 */
import { PrismaClient } from '@prisma/client';
import { semearWorkspace } from '../src/infrastructure/onboarding';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const owner = await prisma.usuario.findFirst({
    where: { papel: 'OWNER' },
    orderBy: { criadoEm: 'asc' },
  });

  if (!owner) {
    throw new Error(
      'Nenhum usuário OWNER encontrado. Rode `pnpm db:seed-owner` antes — as finanças ' +
        'agora pertencem a um dono, então não há onde pendurar o seed sem ele.',
    );
  }

  await semearWorkspace(prisma, owner.id);

  const [totalCategorias, totalContas] = await Promise.all([
    prisma.categoria.count({ where: { donoId: owner.id } }),
    prisma.conta.count({ where: { donoId: owner.id } }),
  ]);
  console.log(
    `Seed ok para ${owner.email}: ${totalCategorias} categorias, ${totalContas} contas, Config criada.`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
