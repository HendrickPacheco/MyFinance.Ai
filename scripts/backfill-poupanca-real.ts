/**
 * Preenche a poupança real dos ciclos fechados (medida por snapshots de patrimônio).
 * DRY-RUN por padrão; só grava com --aplicar. Uso: pnpm backfill:poupanca [--aplicar]
 */
import { PrismaClient } from '@prisma/client';
import { backfillPoupancaReal } from '../src/application/backfill-poupanca-real';
import { RelogioSistema } from '../src/infrastructure/relogio/relogio-sistema';
import {
  PrismaConfigRepository,
  PrismaCicloRepository,
  PrismaPatrimonioRepository,
} from '../src/infrastructure/repositories/prisma-repositories';
import { formatBRL } from '../src/shared/dinheiro';
import type { Deps } from '../src/application/deps';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');

async function main() {
  const owners = await prisma.usuario.findMany({ where: { papel: 'OWNER' } });
  if (!owners.length) throw new Error('Nenhum OWNER encontrado. Rode `pnpm db:seed-owner`.');
  console.log(aplicar ? '\nMODO: APLICAR (grava)\n' : '\nMODO: DRY-RUN (nada é gravado; use --aplicar)\n');

  for (const owner of owners) {
    const donoId = owner.id;
    const cfg = await new PrismaConfigRepository(prisma, donoId).obter();
    const deps = {
      ator: { id: donoId, papel: owner.papel },
      relogio: new RelogioSistema(cfg?.timezone ?? 'America/Sao_Paulo'),
      ciclos: new PrismaCicloRepository(prisma, donoId),
      patrimonio: new PrismaPatrimonioRepository(prisma, donoId),
    } as unknown as Deps;

    const linhas = await backfillPoupancaReal(deps, { aplicar });
    console.log(`Dono ${owner.email ?? donoId}`);
    console.table(
      linhas.map((l) => ({
        inicio: l.dataInicio,
        status: l.status,
        poupancaReal: l.realCents === null ? '' : formatBRL(l.realCents),
      })),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
