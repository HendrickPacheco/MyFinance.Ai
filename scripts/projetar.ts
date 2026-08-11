/**
 * Roda a projeção de ciclos pelo MOTOR, fora do navegador.
 *
 * Existe para responder "como ficam meus próximos ciclos?" sem depender do
 * copiloto nem de recalcular à mão numa conversa — os dois já erraram uma vez
 * cada. Aqui os números saem de `obterProjecao`, o mesmo caso de uso que a
 * tela `/projecao` usa.
 *
 * NÃO faz parte do app: vive em `scripts/`, não é importado por nada em `src/`,
 * e é somente leitura. Uso: pnpm projetar [numCiclos]
 */
import { PrismaClient } from '@prisma/client';
import { obterProjecao } from '../src/application/projecao';
import { RelogioSistema } from '../src/infrastructure/relogio/relogio-sistema';
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
} from '../src/infrastructure/repositories/prisma-repositories';
import { formatBRL } from '../src/shared/dinheiro';
import type { Deps } from '../src/application/deps';

const prisma = new PrismaClient();

async function main() {
  const numCiclos = Number(process.argv[2] ?? 6);

  // Script de dono único: pega o OWNER. O app real resolve isso pela sessão.
  const owner = await prisma.usuario.findFirst({ where: { papel: 'OWNER' } });
  if (!owner) throw new Error('Nenhum OWNER encontrado. Rode `pnpm db:seed-owner`.');

  const donoId = owner.id;
  const config = new PrismaConfigRepository(prisma, donoId);
  const cfg = await config.obter();
  if (!cfg) throw new Error('Config não encontrada para o OWNER.');

  const deps = {
    ator: { id: donoId, papel: owner.papel },
    relogio: new RelogioSistema(cfg.timezone),
    config,
    contas: new PrismaContaRepository(prisma, donoId),
    categorias: new PrismaCategoriaRepository(prisma, donoId),
    custosFixos: new PrismaCustoFixoRepository(prisma, donoId),
    pagamentosFixos: new PrismaPagamentoFixoRepository(prisma, donoId),
    provisoes: new PrismaProvisaoRepository(prisma, donoId),
    transacoes: new PrismaTransacaoRepository(prisma, donoId),
    parcelamentos: new PrismaParcelamentoRepository(prisma, donoId),
    ciclos: new PrismaCicloRepository(prisma, donoId),
    patrimonio: new PrismaPatrimonioRepository(prisma, donoId),
  } as unknown as Deps;

  const projecao = await obterProjecao(deps, { numCiclos });

  console.log(`\nConfig vigente: renda ${formatBRL(cfg.rendaBaseCents)} · meta ${formatBRL(cfg.metaPoupancaCents)}${cfg.metaPoupancaPercent != null ? ` (${cfg.metaPoupancaPercent}%)` : ''} · dia ${cfg.diaRecebimento}\n`);

  const linhas = projecao.ciclos.map((c) => ({
    ciclo: `${c.inicio} a ${c.fim}`,
    renda: formatBRL(c.rendaPrevistaCents),
    poupanca: formatBRL(c.poupancaAlvoCents),
    fixos: formatBRL(c.fixosCents),
    verbaVariavel: formatBRL(c.verbaVariavelCents),
    parcelas: formatBRL(c.parcelasComprometidasCents),
    verbaLivre: formatBRL(c.verbaLivreCents),
    porDia: formatBRL(c.verbaDiariaLivreCents),
    apertado: c.abaixoDoPiso ? 'SIM' : '',
  }));
  console.table(linhas);

  const fins = projecao.ciclos.flatMap((c) =>
    c.terminamNesteCiclo.map((f) => `${c.inicio}: acaba "${f.descricao}"`),
  );
  if (fins.length) console.log('\nParcelamentos que terminam:\n' + fins.map((f) => '  ' + f).join('\n'));

  console.log('\nPremissas:\n' + projecao.premissas.map((p) => '  - ' + p).join('\n') + '\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
