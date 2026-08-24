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
  PrismaCustoFixoRepository,
  PrismaPagamentoFixoRepository,
  PrismaProvisaoRepository,
  PrismaParcelamentoRepository,
} from '../src/infrastructure/repositories/prisma-repositories';
import { PrismaMemoriaRepository } from '../src/infrastructure/repositories/prisma-memoria';
import { PrismaConversaRepository } from '../src/infrastructure/repositories/prisma-conversa';
import { semearWorkspace } from '../src/infrastructure/onboarding';
import { exportarTudo } from '../src/infrastructure/backup';
import { validarCategoriaDeCustoFixo } from '../src/application/categoria-custo-fixo';

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
    custosFixos: new PrismaCustoFixoRepository(prisma, a.id),
    pagamentosFixos: new PrismaPagamentoFixoRepository(prisma, a.id),
    provisoes: new PrismaProvisaoRepository(prisma, a.id),
    parcelamentos: new PrismaParcelamentoRepository(prisma, a.id),
  };
  const repoB = {
    contas: new PrismaContaRepository(prisma, b.id),
    categorias: new PrismaCategoriaRepository(prisma, b.id),
    transacoes: new PrismaTransacaoRepository(prisma, b.id),
    ciclos: new PrismaCicloRepository(prisma, b.id),
    config: new PrismaConfigRepository(prisma, b.id),
    custosFixos: new PrismaCustoFixoRepository(prisma, b.id),
    pagamentosFixos: new PrismaPagamentoFixoRepository(prisma, b.id),
    provisoes: new PrismaProvisaoRepository(prisma, b.id),
    parcelamentos: new PrismaParcelamentoRepository(prisma, b.id),
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

  // A memória usa SQL CRU (pgvector não é tipado pelo Prisma), então ela não
  // herda o escopo automático do Prisma Client — é a tabela onde um `where`
  // esquecido vazaria sem ninguém notar. Por isso ela é verificada aqui, e não
  // só por teste de unidade com fake.
  console.log('\nMEMÓRIA (Fase E — SQL cru, sem escopo automático):');
  const memA = new PrismaMemoriaRepository(prisma, a.id);
  const memB = new PrismaMemoriaRepository(prisma, b.id);

  const VETOR_A = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  const memoriaA = await memA.criar({
    tipo: 'PLANO',
    texto: 'plano secreto do dono A',
    origem: 'USUARIO',
    embedding: VETOR_A,
  });

  checar('B não lista a memória do A', (await memB.listar()).length === 0);
  checar('B não obtém a memória do A por id', (await memB.obter(memoriaA.id)) === null);
  checar(
    'a busca semântica do B não alcança a memória do A',
    (await memB.buscarPorEmbedding(VETOR_A)).every((m) => m.id !== memoriaA.id),
  );
  checar(
    'B não vê a memória do A entre as sem embedding',
    (await memB.listarSemEmbedding()).every((m) => m.id !== memoriaA.id),
  );

  await memB.arquivar(memoriaA.id);
  await memB.definirEmbedding(memoriaA.id, Array.from({ length: 1536 }, () => 0.5));
  const memoriaAposTentativas = await memA.obter(memoriaA.id);
  checar('arquivar com id alheio não afeta a memória do A', memoriaAposTentativas?.ativo === true);
  checar(
    'a memória do A segue com o texto original',
    memoriaAposTentativas?.texto === 'plano secreto do dono A',
  );
  checar(
    'a busca do A ainda encontra a memória dele (embedding intacto)',
    (await memA.buscarPorEmbedding(VETOR_A))[0]?.id === memoriaA.id,
  );

  // Conversas do copiloto (Fase 1 da persistência). `obterComMensagens` com um
  // id de outro dono é o vetor de vazamento nº 1 desta feature — devolver a
  // transcrição alheia por engano —, então é o primeiro caso conferido aqui.
  console.log('\nCONVERSAS DO COPILOTO — B não lê nem altera as do A:');
  const convA = new PrismaConversaRepository(prisma, a.id);
  const convB = new PrismaConversaRepository(prisma, b.id);

  const conversaA = await convA.criar('plano secreto do dono A');
  await convA.anexarTurno(conversaA.id, {
    pergunta: 'quanto posso gastar hoje?',
    resposta: 'segredo do dono A: R$ 47,00',
    proveniencia: {
      ferramentasUsadas: [],
      valoresCitados: [],
      valoresNaoRastreados: [],
      propostas: [],
      semFerramenta: false,
      incompleta: false,
    },
  });

  checar('B não lista a conversa do A', (await convB.listar()).length === 0);
  checar(
    'obterComMensagens(conversa do A) devolve null para o B',
    (await convB.obterComMensagens(conversaA.id)) === null,
  );
  checar(
    'ultimasMensagens(conversa do A) vem vazio para o B',
    (await convB.ultimasMensagens(conversaA.id, 10)).length === 0,
  );

  await esperaErro('anexarTurno(conversa do A) pelo B é recusado', () =>
    convB.anexarTurno(conversaA.id, {
      pergunta: 'invasão',
      resposta: 'invasão',
      proveniencia: null,
    }),
  );
  await convB.renomear(conversaA.id, 'invadida');
  await convB.excluir(conversaA.id);

  const conversaAposTentativas = await convA.obterComMensagens(conversaA.id);
  checar('a conversa do A sobrevive às tentativas do B', conversaAposTentativas !== null);
  checar(
    'o título do A não foi alterado pelo B',
    conversaAposTentativas?.conversa.titulo === 'plano secreto do dono A',
  );
  checar(
    'as duas mensagens do turno do A seguem intactas',
    conversaAposTentativas?.mensagens.length === 2,
  );
  checar(
    'a resposta do A segue com o texto original',
    conversaAposTentativas?.mensagens[1]?.conteudo === 'segredo do dono A: R$ 47,00',
  );

  // Repositórios de gestão de custos (TASKS-CUSTOS.md, fase de portas). São os
  // métodos que a tela de CRUD vai chamar com um id vindo da URL — exatamente
  // o caminho por onde um `findUnique({ where: { id } })` esquecido devolveria
  // a linha de outro dono.
  console.log('\nCUSTOS — B não lê nem apaga cadastro do A:');
  const custoA = await repoA.custosFixos.salvar({
    id: '',
    nome: 'Aluguel secreto do A',
    valorCents: 240_000,
    diaVencimento: 5,
    ativo: true,
    contaId: null,
    categoriaId: null,
    vigenteDe: null,
    vigenteAte: null,
  });
  const provisaoA = await repoA.provisoes.salvar({
    id: '',
    nome: 'IPVA do A',
    valorAnualCents: 180_000,
    mesEsperado: 1,
    acumuladoCents: 50_000,
    ativo: true,
  });
  const parcelamentoA = await repoA.parcelamentos.criar({
    id: '',
    descricao: 'Notebook do A',
    valorTotalCents: 349_900,
    numParcelas: 12,
    dataCompra: '2026-09-03',
    categoriaId: null,
    encerradoEm: null,
  });

  // `contarPorCustoFixoAgrupado` usa `groupBy`, que também é query do Prisma
  // Client e NÃO herda escopo automático: sem `donoId` no where, a tela de
  // custos do B veria a contagem de pagamentos do A e ofereceria/negaria
  // exclusão pelo motivo errado.
  await repoA.pagamentosFixos.marcarPago(custoA.id, cicloA.ciclo.id, '2026-09-05');

  checar('obter(custo fixo do A) devolve null', (await repoB.custosFixos.obter(custoA.id)) === null);
  checar(
    'contarPorCustoFixo(custo do A) é 0 para o B',
    (await repoB.pagamentosFixos.contarPorCustoFixo(custoA.id)) === 0,
  );
  checar(
    'contarPorCustoFixoAgrupado do B não cita o custo do A',
    (await repoB.pagamentosFixos.contarPorCustoFixoAgrupado())[custoA.id] === undefined,
  );
  checar(
    'contarPorCustoFixoAgrupado do A enxerga o próprio pagamento',
    (await repoA.pagamentosFixos.contarPorCustoFixoAgrupado())[custoA.id] === 1,
  );
  checar(
    'listarTodos do B não traz o custo do A',
    (await repoB.custosFixos.listarTodos()).every((c) => c.id !== custoA.id),
  );
  checar('obter(provisão do A) devolve null', (await repoB.provisoes.obter(provisaoA.id)) === null);
  checar(
    'listarTodas do B não traz a provisão do A',
    (await repoB.provisoes.listarTodas()).every((p) => p.id !== provisaoA.id),
  );
  checar(
    'obter(parcelamento do A) devolve null',
    (await repoB.parcelamentos.obter(parcelamentoA.id)) === null,
  );
  checar(
    'listar do B não traz o parcelamento do A',
    (await repoB.parcelamentos.listar()).every((p) => p.id !== parcelamentoA.id),
  );
  checar(
    'listarPorParcelamento(id do A) vem vazio para o B',
    (await repoB.transacoes.listarPorParcelamento(parcelamentoA.id)).length === 0,
  );

  await esperaErro('excluir(custo fixo do A) é recusado', () =>
    repoB.custosFixos.excluir(custoA.id),
  );
  await esperaErro('excluir(provisão do A) é recusado', () =>
    repoB.provisoes.excluir(provisaoA.id),
  );
  await esperaErro('atualizar(parcelamento do A) é recusado', () =>
    repoB.parcelamentos.atualizar(parcelamentoA.id, { encerradoEm: '2026-09-30' }),
  );

  checar('o custo fixo do A segue existindo', (await repoA.custosFixos.obter(custoA.id)) !== null);
  checar(
    'a provisão do A segue com o acumulado intacto',
    (await repoA.provisoes.obter(provisaoA.id))?.acumuladoCents === 50_000,
  );
  checar(
    'o parcelamento do A segue em andamento',
    (await repoA.parcelamentos.obter(parcelamentoA.id))?.encerradoEm === null,
  );

  // ── Arestas fechadas na G0 (TASKS-GRAFO §6) ───────────────────────────────
  // `CustoFixo.categoriaId`, `Parcelamento.categoriaId`, `Transacao.estornoDeId`
  // e `Ciclo.cicloAnteriorId` são FKs de verdade agora. A FK confere que o id
  // EXISTE; ela aceitaria de bom grado ligar o custo do dono A à categoria do
  // dono B (§7.2). Quem impede é o guard da camada de aplicação — e é por isso
  // que ele é exercido aqui, contra o Postgres real, e não só com fake.
  console.log('\nARESTAS DA G0 — nenhuma cruza donos:');
  const categoriaA = categoriasA.find((c) => c.nome === 'Mercado');
  const categoriaB = categoriasB.find((c) => c.nome === 'Mercado');
  if (!categoriaA || !categoriaB) throw new Error('categoria "Mercado" ausente no seed');

  await esperaErro('categorizar custo fixo com a categoria do A é recusado ao B', () =>
    validarCategoriaDeCustoFixo({ categorias: repoB.categorias }, categoriaA.id),
  );
  checar(
    'e a própria categoria do B é aceita',
    (await validarCategoriaDeCustoFixo({ categorias: repoB.categorias }, categoriaB.id).then(
      () => true,
      () => false,
    )) === true,
  );

  const custoFixoCategorizadoB = await repoB.custosFixos.salvar({
    id: '',
    nome: 'Internet do B',
    valorCents: 12_000,
    diaVencimento: 15,
    ativo: true,
    contaId: null,
    categoriaId: categoriaB.id,
    vigenteDe: null,
    vigenteAte: null,
  });
  const parcelamentoCategorizadoB = await repoB.parcelamentos.criar({
    id: '',
    descricao: 'Geladeira do B',
    valorTotalCents: 240_000,
    numParcelas: 10,
    dataCompra: '2026-09-04',
    categoriaId: categoriaB.id,
    encerradoEm: null,
  });

  // Critério de aceite explícito da G0: o nome da categoria sai da relação, sem
  // um segundo `findMany` de categorias e um `Map` montado à mão.
  const parcelamentoComCategoria = await prisma.parcelamento.findFirst({
    where: { id: parcelamentoCategorizadoB.id, donoId: b.id },
    include: { categoria: true },
  });
  const custoFixoComCategoria = await prisma.custoFixo.findFirst({
    where: { id: custoFixoCategorizadoB.id, donoId: b.id },
    include: { categoria: true },
  });
  checar(
    'parcelamento.categoria.nome vem pela relação, sem join manual',
    parcelamentoComCategoria?.categoria?.nome === 'Mercado',
  );
  checar(
    'custoFixo.categoria.nome vem pela relação, sem join manual',
    custoFixoComCategoria?.categoria?.nome === 'Mercado',
  );
  checar(
    'e a categoria devolvida é a do B, não a homônima do A',
    parcelamentoComCategoria?.categoriaId === categoriaB.id &&
      custoFixoComCategoria?.categoriaId === categoriaB.id,
  );

  // Cadeia de rollover: `criarSeAusente` resolve o anterior por uma consulta já
  // escopada em `donoId`. O A tem ciclo em 2026-09-01; o B também. Se a cadeia
  // ignorasse o dono, o ciclo de outubro do B apontaria para o de setembro do A
  // (ou vice-versa) e o vazamento seria silencioso.
  const outubroB = await repoB.ciclos.criarSeAusente({
    ...cicloB.ciclo,
    id: '',
    dataInicio: '2026-10-01',
    dataFim: '2026-10-31',
    observacao: 'outubro do B',
  });
  const outubroBNoBanco = await prisma.ciclo.findFirst({
    where: { id: outubroB.ciclo.id },
    select: { cicloAnteriorId: true },
  });
  checar(
    'o ciclo seguinte do B aponta para o ciclo anterior DO B',
    outubroBNoBanco?.cicloAnteriorId === cicloB.ciclo.id,
  );
  checar(
    'e nunca para o ciclo do A na mesma data',
    outubroBNoBanco?.cicloAnteriorId !== cicloA.ciclo.id,
  );
  const setembroANoBanco = await prisma.ciclo.findFirst({
    where: { id: cicloA.ciclo.id },
    select: { cicloAnteriorId: true },
  });
  checar(
    'o ciclo do A não foi religado ao ciclo criado pelo B',
    setembroANoBanco?.cicloAnteriorId === null,
  );

  // ── aplicarLote (TASKS-CUSTOS Fase 8, §5.1 ticket 1) ──────────────────────
  // Query NOVA e a mais perigosa do adapter: um único `$transaction` que
  // APAGA transação, CRIA transação e INCREMENTA saldo de conta e acumulado
  // de provisão. `deleteMany`/`updateMany` não lançam com id alheio — só
  // afetam zero linhas —, então a prova aqui não é "deu erro", é "os dados do
  // A não mudaram" e "o que o B criou nasceu no dono B".
  console.log('\nLOTE TRANSACIONAL — aplicarLote do B não alcança o A:');
  const contasA = await repoA.contas.listar();
  const contaA = contasA[0];
  const saldoAAntes = contaA?.saldoCents ?? 0;

  const criadasPeloB = await repoB.transacoes.aplicarLote({
    excluir: [txA.id],
    criar: [
      {
        id: '',
        data: '2026-09-11',
        valorCents: 777,
        tipo: 'DESPESA',
        descricao: 'lote do B',
        metodo: null,
        categoriaId: null,
        contaId: null,
        contaDestinoId: null,
        provisaoId: null,
        parcelamentoId: null,
        parcelaNum: null,
        estornoDeId: null,
        cicloId: null,
        pagoEm: null,
      },
    ],
    ajustesConta: contaA ? [{ contaId: contaA.id, deltaCents: 999_999 }] : [],
    ajustesProvisao: [{ provisaoId: provisaoA.id, deltaCents: 999_999 }],
  });

  checar('a transação do A NÃO foi apagada pelo lote do B', (await repoA.transacoes.obter(txA.id)) !== null);
  checar(
    'o saldo da conta do A não foi creditado pelo lote do B',
    contaA ? (await repoA.contas.obter(contaA.id))?.saldoCents === saldoAAntes : true,
  );
  checar(
    'o acumulado da provisão do A não foi creditado pelo lote do B',
    (await repoA.provisoes.obter(provisaoA.id))?.acumuladoCents === 50_000,
  );
  checar(
    'a transação criada no lote nasceu no dono B',
    criadasPeloB.length === 1 &&
      (await repoB.transacoes.obter(criadasPeloB[0]?.id ?? '')) !== null &&
      (await repoA.transacoes.obter(criadasPeloB[0]?.id ?? '')) === null,
  );

  console.log('\nBACKUP — o export do B não contém dados do A:');
  const dumpB = JSON.stringify(await exportarTudo(prisma, b.id));
  checar('o dump do B não cita a transação do A', !dumpB.includes(txA.id));
  checar('o dump do B não cita a descrição secreta do A', !dumpB.includes('segredo do dono A'));
  checar('o dump do B não cita a memória do A', !dumpB.includes('plano secreto do dono A'));
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
