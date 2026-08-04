/**
 * Verificação de ISOLAMENTO ENTRE USUÁRIOS contra o Postgres REAL.
 *
 *   pnpm verificar:isolamento
 *
 * Por que um script e não um teste de unidade: o vazamento que queremos excluir
 * é entre CONSULTAS SQL. Um fake de Prisma provaria apenas que escrevemos o
 * `where` que nós mesmos esperamos — não que o banco obedece. Aqui dois donos
 * de verdade são criados, um tenta alcançar os dados do outro por id, e o banco
 * responde.
 *
 * SEGURANÇA DO SEU BANCO: o script só cria e apaga DOIS usuários de teste com
 * emails dedicados. Ele nunca toca o OWNER real nem os dados dele — e confere
 * isso ao final, comparando a contagem de transações antes e depois.
 */
import { PrismaClient } from '@prisma/client';
import {
  PrismaCicloRepository,
  PrismaContaRepository,
  PrismaTransacaoRepository,
  PrismaCategoriaRepository,
  PrismaConfigRepository,
} from '../src/infrastructure/repositories/prisma-repositories';
import { semearWorkspace } from '../src/infrastructure/onboarding';
import { exportarTudo } from '../src/infrastructure/backup';

const prisma = new PrismaClient();

const EMAIL_A = '__isolamento_a@teste.local';
const EMAIL_B = '__isolamento_b@teste.local';

let falhas = 0;

function checar(descricao: string, condicao: boolean): void {
  if (condicao) {
    console.log(`  ok   ${descricao}`);
  } else {
    console.error(`  FALHA ${descricao}`);
    falhas += 1;
  }
}

async function esperaErro(descricao: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    checar(descricao, false);
  } catch {
    checar(descricao, true);
  }
}

async function limpar(): Promise<void> {
  // Cascade leva junto config, contas, categorias, ciclos e transações.
  await prisma.usuario.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
}

async function main(): Promise<void> {
  const txAntes = await prisma.transacao.count();

  await limpar(); // resquício de uma execução anterior interrompida

  const a = await prisma.usuario.create({
    data: { email: EMAIL_A, papel: 'OWNER', senhaHash: null },
  });
  const b = await prisma.usuario.create({
    data: { email: EMAIL_B, papel: 'OWNER', senhaHash: null },
  });

  await semearWorkspace(prisma, a.id);
  await semearWorkspace(prisma, b.id);

  const repoA = {
    contas: new PrismaContaRepository(prisma, a.id),
    categorias: new PrismaCategoriaRepository(prisma, a.id),
    transacoes: new PrismaTransacaoRepository(prisma, a.id),
    ciclos: new PrismaCicloRepository(prisma, a.id),
    config: new PrismaConfigRepository(prisma, a.id),
  };
  const repoB = {
    contas: new PrismaContaRepository(prisma, b.id),
    categorias: new PrismaCategoriaRepository(prisma, b.id),
    transacoes: new PrismaTransacaoRepository(prisma, b.id),
    ciclos: new PrismaCicloRepository(prisma, b.id),
    config: new PrismaConfigRepository(prisma, b.id),
  };

  // ── Dados só do A ─────────────────────────────────────────────────────────
  const cicloA = await repoA.ciclos.criarSeAusente({
    id: '',
    dataInicio: '2026-09-01',
    dataFim: '2026-09-30',
    rendaPrevistaCents: 3_000_000,
    rendaRealizadaCents: null,
    poupancaAlvoCents: 1_800_000,
    fixosCents: 488_400,
    provisaoMensalCents: 0,
    verbaVariavelCents: 711_600,
    rolloverRecebidoCents: 0,
    fechado: false,
    fechadoEm: null,
    sobraCents: null,
    observacao: null,
  });

  const categoriasA = await repoA.categorias.listar();
  const txA = await repoA.transacoes.criar({
    id: '',
    data: '2026-09-10',
    valorCents: 12_345,
    tipo: 'DESPESA',
    descricao: 'segredo do dono A',
    metodo: null,
    categoriaId: categoriasA[0]?.id ?? null,
    contaId: null,
    contaDestinoId: null,
    provisaoId: null,
    parcelamentoId: null,
    parcelaNum: null,
    estornoDeId: null,
    cicloId: cicloA.ciclo.id,
    pagoEm: null,
  });

  console.log('\nLEITURA — B não enxerga nada do A:');
  checar('obter(transacao do A) devolve null', (await repoB.transacoes.obter(txA.id)) === null);
  checar('obter(ciclo do A) devolve null', (await repoB.ciclos.obter(cicloA.ciclo.id)) === null);
  checar(
    'listarPorCiclo(ciclo do A) vem vazio',
    (await repoB.transacoes.listarPorCiclo(cicloA.ciclo.id)).length === 0,
  );
  checar(
    'listarPorIntervalo não traz a transação do A',
    (await repoB.transacoes.listarPorIntervalo('2026-09-01', '2026-09-30')).every(
      (t) => t.id !== txA.id,
    ),
  );
  checar(
    'obterPorInicio(mesma data) não devolve o ciclo do A',
    (await repoB.ciclos.obterPorInicio('2026-09-01'))?.id !== cicloA.ciclo.id,
  );
  checar(
    'obterAtual não devolve o ciclo do A',
    (await repoB.ciclos.obterAtual('2026-09-15')) === null,
  );

  console.log('\nESCRITA — B não altera nada do A:');
  await esperaErro('atualizar(transacao do A) é recusado', () =>
    repoB.transacoes.atualizar(txA.id, { valorCents: 1 }),
  );
  await esperaErro('excluir(transacao do A) é recusado', () =>
    repoB.transacoes.excluir(txA.id),
  );
  await esperaErro('atualizar(ciclo do A) é recusado', () =>
    repoB.ciclos.atualizar(cicloA.ciclo.id, { observacao: 'invadido' }),
  );
  checar(
    'fecharSePendente(ciclo do A) não fecha',
    (await repoB.ciclos.fecharSePendente(cicloA.ciclo.id, { fechado: true })) === false,
  );

  const txAposTentativas = await repoA.transacoes.obter(txA.id);
  checar('a transação do A segue intacta', txAposTentativas?.valorCents === 12_345);
  checar(
    'a descrição do A não foi alterada',
    txAposTentativas?.descricao === 'segredo do dono A',
  );

  console.log('\nUNICIDADE POR DONO — os dois podem ter os mesmos nomes/datas:');
  const cicloB = await repoB.ciclos.criarSeAusente({
    ...cicloA.ciclo,
    id: '',
    observacao: 'ciclo do B na MESMA data',
  });
  checar('B cria ciclo na mesma dataInicio que o A', cicloB.criado === true);
  checar('e é um ciclo diferente', cicloB.ciclo.id !== cicloA.ciclo.id);
  const categoriasB = await repoB.categorias.listar();
  checar(
    'ambos têm a categoria "Mercado", cada um a sua',
    categoriasA.some((c) => c.nome === 'Mercado') &&
      categoriasB.some((c) => c.nome === 'Mercado') &&
      categoriasA.find((c) => c.nome === 'Mercado')?.id !==
        categoriasB.find((c) => c.nome === 'Mercado')?.id,
  );

  console.log('\nBACKUP — o export do B não contém dados do A:');
  const dumpB = JSON.stringify(await exportarTudo(prisma, b.id));
  checar('o dump do B não cita a transação do A', !dumpB.includes(txA.id));
  checar('o dump do B não cita a descrição secreta do A', !dumpB.includes('segredo do dono A'));
  checar('o dump do B não carrega donoId nenhum', !dumpB.includes('donoId'));

  console.log('\nCONFIG — uma por dono:');
  const cfgA = await repoA.config.obter();
  const cfgB = await repoB.config.obter();
  checar('A tem Config própria', cfgA !== null);
  checar('B tem Config própria', cfgB !== null);
  checar('e são registros distintos', cfgA?.id !== cfgB?.id);

  await limpar();

  const txDepois = await prisma.transacao.count();
  console.log('\nSEUS DADOS:');
  checar(
    `contagem de transações intacta (${txAntes} antes, ${txDepois} depois)`,
    txAntes === txDepois,
  );

  console.log(
    falhas === 0
      ? '\nIsolamento entre usuários: OK.'
      : `\n${falhas} verificação(ões) FALHARAM — há vazamento entre usuários.`,
  );
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch(async (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    await limpar().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
