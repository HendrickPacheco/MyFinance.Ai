/**
 * Composition root. ÚNICO lugar que conhece infraestrutura concreta e a
 * conecta às portas. Server actions e páginas chamam `criarDeps()` e passam o
 * bag para os casos de uso. O relógio respeita o timezone da Config.
 */
import { prisma } from '@/infrastructure/persistence/prisma';
import { RelogioSistema } from '@/infrastructure/relogio/relogio-sistema';
import {
  PrismaConfigRepository,
  PrismaContaRepository,
  PrismaCategoriaRepository,
  PrismaCustoFixoRepository,
  PrismaPagamentoFixoRepository,
  PrismaProvisaoRepository,
  PrismaTransacaoRepository,
  PrismaParcelamentoRepository,
  PrismaCicloRepository,
  PrismaPatrimonioRepository,
} from '@/infrastructure/repositories/prisma-repositories';
import { iaHabilitada } from '@/infrastructure/ia/config-ia';
import { criarProvedorIA } from '@/infrastructure/ia/provedor-ia';
import type { Deps } from '@/application/deps';

export { prisma };

export async function criarDeps(): Promise<Deps> {
  const config = new PrismaConfigRepository(prisma);
  const cfg = await config.obter();
  const relogio = new RelogioSistema(cfg?.timezone ?? 'America/Bahia');

  return {
    relogio,
    config,
    contas: new PrismaContaRepository(prisma),
    categorias: new PrismaCategoriaRepository(prisma),
    custosFixos: new PrismaCustoFixoRepository(prisma),
    pagamentosFixos: new PrismaPagamentoFixoRepository(prisma),
    provisoes: new PrismaProvisaoRepository(prisma),
    transacoes: new PrismaTransacaoRepository(prisma),
    parcelamentos: new PrismaParcelamentoRepository(prisma),
    ciclos: new PrismaCicloRepository(prisma),
    patrimonio: new PrismaPatrimonioRepository(prisma),
    // Com IA_HABILITADA=false o campo fica `undefined` e nenhuma tela muda.
    ia: iaHabilitada() ? criarProvedorIA() : undefined,
  };
}
