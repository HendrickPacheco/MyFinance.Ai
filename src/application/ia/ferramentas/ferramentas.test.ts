/**
 * Testes dos wrappers de ferramenta (D2, critérios da D6).
 *
 * O que estes testes existem para impedir, em ordem de gravidade:
 *  1. uma ferramenta gravar no banco (trava 5 / decisão D-8);
 *  2. um `*Formatado` divergir do seu `*Cents` — é assim que o copiloto
 *     narraria um número que não é o do motor;
 *  3. uma falha virar exceção e matar o loop do agente no meio da resposta.
 */
import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/shared/dinheiro';
import {
  CONFIG_PADRAO,
  criarDeps,
  cicloFake,
  contaFake,
  transacaoFake,
  type FakeDeps,
} from '@/application/__fakes__/fakes-ciclo-fechamento';
import { dinheiro } from './saida';
import { CATALOGO_FERRAMENTAS } from './catalogo';
import { NOMES_DE_FERRAMENTA, executarFerramenta } from './index';
import { obterEstadoPainelSomenteLeitura } from '@/application/dashboard';

const HOJE = '2026-07-20';

/**
 * Ciclo atual congelado. A verba gravada é `renda − fixos − provisão` (D-16),
 * e como o fake não tem fixo nem provisão ela é a própria renda: R$ 8.000. O
 * default de `cicloFake` é R$ 7.000 — a renda menos a meta, a fórmula de antes
 * da D-16 —, e a composição da verba tem que fechar com o número gravado.
 */
function cicloAtual() {
  return cicloFake({
    id: 'ciclo-atual',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    verbaVariavelCents: 800_000,
  });
}

const IMPORTACAO_FIXTURE_ID = 'importacao-fixture';

/**
 * Um rascunho de importação com uma linha de cada faixa (§9.2/§15.7), para
 * `conciliar_importacao`/`propor_importacao` terem o que ler na bateria
 * genérica. Construído direto nos arrays públicos do fake — não passa por
 * `criarRascunho` porque a extração/conciliação em si é de outra fase (I2),
 * já testada em `domain/finance/importacao.test.ts`.
 */
function semearImportacao(deps: FakeDeps): void {
  deps.importacoes.importacoes.push({
    id: IMPORTACAO_FIXTURE_ID,
    origem: 'TEXTO_COLADO',
    nomeArquivo: null,
    hashConteudo: 'hash-fixture',
    competenciaRef: '2026-07',
    status: 'RASCUNHO',
    tokensEntrada: 0,
    tokensSaida: 0,
    criadaEm: new Date('2026-07-20T12:00:00Z'),
    confirmadaEm: null,
  });
  deps.importacoes.itens.push(
    {
      id: 'item-ja-registrado',
      importacaoId: IMPORTACAO_FIXTURE_ID,
      ordem: 1,
      descricaoOriginal: 'UBER TRIP',
      valorCents: 2_500,
      sinal: 'COMPRA',
      data: '2026-07-10',
      dataOriginalTexto: '10/07',
      parcelaAtual: null,
      parcelaTotal: null,
      confianca: 'ALTA',
      veredito: 'CASA_VARIAVEL',
      vereditoMotivo: 'Casa com a transação t1 por valor e data.',
      alvoTipo: 'TRANSACAO',
      alvoId: 't1',
      decisao: 'PENDENTE',
      chaveDedup: 'dedup-1',
    },
    {
      id: 'item-custo-fixo',
      importacaoId: IMPORTACAO_FIXTURE_ID,
      ordem: 2,
      descricaoOriginal: 'NETFLIX.COM',
      valorCents: 3_990,
      sinal: 'COMPRA',
      data: '2026-07-05',
      dataOriginalTexto: '05/07',
      parcelaAtual: null,
      parcelaTotal: null,
      confianca: 'ALTA',
      veredito: 'CASA_CUSTO_FIXO',
      vereditoMotivo: 'Casa com o custo fixo Netflix por nome e valor.',
      alvoTipo: 'CUSTO_FIXO',
      alvoId: 'cf-netflix',
      decisao: 'PENDENTE',
      chaveDedup: 'dedup-2',
    },
    {
      id: 'item-novo',
      importacaoId: IMPORTACAO_FIXTURE_ID,
      ordem: 3,
      descricaoOriginal: 'PADARIA DO ZE',
      valorCents: 1_890,
      sinal: 'COMPRA',
      data: '2026-07-12',
      dataOriginalTexto: '12/07',
      parcelaAtual: null,
      parcelaTotal: null,
      confianca: 'ALTA',
      veredito: 'NOVA_AVULSA',
      vereditoMotivo: 'Sem casamento com transação, custo fixo ou parcela existente.',
      alvoTipo: null,
      alvoId: null,
      decisao: 'PENDENTE',
      chaveDedup: 'dedup-3',
    },
    {
      id: 'item-precisa-de-voce',
      importacaoId: IMPORTACAO_FIXTURE_ID,
      ordem: 4,
      descricaoOriginal: 'TARIFA DE MANUTENCAO',
      valorCents: 1_500,
      sinal: 'TARIFA',
      data: '2026-07-15',
      dataOriginalTexto: '15/07',
      parcelaAtual: null,
      parcelaTotal: null,
      confianca: 'MEDIA',
      veredito: 'NOVA_AVULSA',
      vereditoMotivo: 'Tarifa sem casamento — o dono decide se é dele.',
      alvoTipo: null,
      alvoId: null,
      decisao: 'PENDENTE',
      chaveDedup: 'dedup-4',
    },
    {
      id: 'item-ignorado',
      importacaoId: IMPORTACAO_FIXTURE_ID,
      ordem: 5,
      descricaoOriginal: 'PAGAMENTO RECEBIDO',
      valorCents: 500_00,
      sinal: 'PAGAMENTO_FATURA',
      data: '2026-07-18',
      dataOriginalTexto: '18/07',
      parcelaAtual: null,
      parcelaTotal: null,
      confianca: 'ALTA',
      veredito: 'IGNORAR',
      vereditoMotivo: 'Pagamento da própria fatura, não é gasto.',
      alvoTipo: null,
      alvoId: null,
      decisao: 'PENDENTE',
      chaveDedup: 'dedup-5',
    },
  );
}

function depsCompletos(): FakeDeps {
  const deps = criarDeps({
    hoje: HOJE,
    ciclos: [cicloAtual()],
    contas: [contaFake({ id: 'c1', saldoCents: 500_000 })],
    transacoes: [
      transacaoFake({ id: 't1', data: '2026-07-10', valorCents: 12_000, cicloId: 'ciclo-atual' }),
      transacaoFake({ id: 't2', data: HOJE, valorCents: 4_500, cicloId: 'ciclo-atual' }),
      transacaoFake({
        id: 'p1',
        data: '2026-07-25',
        valorCents: 50_000,
        cicloId: 'ciclo-atual',
        parcelamentoId: 'pc-1',
        parcelaNum: 1,
      }),
    ],
  });
  semearImportacao(deps);
  return deps;
}

/** Argumentos válidos mínimos por ferramenta. */
const ARGUMENTOS: Record<string, unknown> = {
  situacao_hoje: {},
  estado_ciclo: {},
  gastos_por_categoria: { limite: null },
  pagamentos_pendentes: {},
  para_onde_vai_a_renda: { limite: null },
  analise_corte: { numCiclos: null },
  assinaturas_detectadas: { numCiclos: null },
  patrimonio_resumo: {},
  projetar_ciclos: { numCiclos: 3 },
  simular_compra_parcelada: {
    descricao: 'Notebook',
    valorTotalCents: 300_000,
    numParcelas: 10,
    dataCompra: null,
    numCiclos: null,
  },
  simular_meta_prazo: { alvoCents: 7_000_000, dataLimite: '2027-01-31' },
  simular_renda: { rendaHipoteticaCents: 1_500_000, numCiclos: null },
  // Propostas (D-8) e memória (Fase E). Entram na MESMA bateria genérica de
  // propósito: o teste "%s não grava nada" acima é a prova executável de que
  // uma ferramenta `propor_*` não escreve — o coração do contrato da D-8.
  opcoes_de_lancamento: {},
  propor_lancamento: {
    valorCents: 4_700,
    descricao: 'Almoço',
    data: null,
    categoriaId: null,
    contaId: null,
    metodo: null,
  },
  propor_parcelamento: {
    descricao: 'Geladeira',
    valorTotalCents: 300_000,
    numParcelas: 10,
    dataCompra: null,
    categoriaId: null,
    metodo: null,
  },
  buscar_memoria: { consulta: 'planos de longo prazo', limite: null },
  propor_memoria: { tipoMemoria: 'PLANO', texto: 'quer sair do aluguel até 2028' },
  // Importação de fatura (I3) — leem o rascunho semeado por `semearImportacao`.
  conciliar_importacao: { importacaoId: IMPORTACAO_FIXTURE_ID },
  propor_importacao: { importacaoId: IMPORTACAO_FIXTURE_ID },
  poupanca_real: {},
  renda_do_ciclo: {},
};

function fotografar(deps: FakeDeps): string {
  return JSON.stringify({
    ciclos: deps.ciclos.itens,
    transacoes: deps.transacoes.itens,
    contas: deps.contas.itens,
    pagamentos: deps.pagamentosFixos.itens,
    patrimonio: deps.patrimonio.itens,
  });
}

/** Percorre a saída e devolve todo par (nomeCents, valor) encontrado. */
function paresMonetarios(valor: unknown, caminho = ''): { caminho: string; obj: Record<string, unknown> }[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => paresMonetarios(v, `${caminho}[${i}]`));
  }
  if (typeof valor !== 'object' || valor === null) return [];

  const obj = valor as Record<string, unknown>;
  const aqui = Object.keys(obj).some((k) => k.endsWith('Cents'))
    ? [{ caminho, obj }]
    : [];

  return [
    ...aqui,
    ...Object.entries(obj).flatMap(([k, v]) => paresMonetarios(v, `${caminho}.${k}`)),
  ];
}

describe('registro de ferramentas', () => {
  it('catálogo e executores são bijetivos', () => {
    expect([...NOMES_DE_FERRAMENTA].sort()).toEqual(
      CATALOGO_FERRAMENTAS.map((f) => f.nome).sort(),
    );
  });
});

describe('toda ferramenta, com dados reais', () => {
  it.each(CATALOGO_FERRAMENTAS.map((f) => f.nome))('%s não grava nada', async (nome) => {
    const deps = depsCompletos();
    const antes = fotografar(deps);

    await executarFerramenta(deps, nome, ARGUMENTOS[nome]);

    expect(fotografar(deps)).toBe(antes);
    expect(deps.ciclos.criarChamadas).toBe(0);
    expect(deps.config.salvarChamadas).toBe(0);
  });

  it.each(CATALOGO_FERRAMENTAS.map((f) => f.nome))('%s devolve comoFoiCalculado e não erro', async (nome) => {
    const saida = await executarFerramenta(depsCompletos(), nome, ARGUMENTOS[nome]);

    expect(saida.erro, `${nome} devolveu erro: ${String(saida.erro)}`).toBeUndefined();
    expect(saida.comoFoiCalculado, `${nome} sem comoFoiCalculado`).toMatch(/\.ts: \w/);
  });

  it.each(CATALOGO_FERRAMENTAS.map((f) => f.nome))(
    '%s: todo *Cents tem *Formatado igual a formatBRL(Cents)',
    async (nome) => {
      const saida = await executarFerramenta(depsCompletos(), nome, ARGUMENTOS[nome]);

      for (const { caminho, obj } of paresMonetarios(saida)) {
        for (const [campo, valor] of Object.entries(obj)) {
          if (!campo.endsWith('Cents')) continue;
          const irmao = `${campo.slice(0, -'Cents'.length)}Formatado`;

          expect(typeof valor, `${nome}${caminho}.${campo} não é number`).toBe('number');
          expect(Number.isInteger(valor), `${nome}${caminho}.${campo} não é inteiro`).toBe(true);
          expect(obj[irmao], `${nome}${caminho} sem ${irmao}`).toBe(formatBRL(valor as number));
        }
      }
    },
  );

  // Estas SEMPRE têm dinheiro a mostrar havendo ciclo aberto. As demais
  // (análise, assinaturas, patrimônio) dependem de histórico que pode não
  // existir, e vir vazio é resposta correta — não ausência de cobertura.
  const SEMPRE_COM_DINHEIRO = [
    'situacao_hoje',
    'estado_ciclo',
    'gastos_por_categoria',
    'pagamentos_pendentes',
    'projetar_ciclos',
    'simular_compra_parcelada',
    'simular_renda',
  ];

  it.each(SEMPRE_COM_DINHEIRO)('%s expõe pelo menos um valor monetário', async (nome) => {
    const saida = await executarFerramenta(depsCompletos(), nome, ARGUMENTOS[nome]);

    const campos = paresMonetarios(saida).flatMap(({ obj }) =>
      Object.keys(obj).filter((k) => k.endsWith('Cents')),
    );
    expect(campos.length).toBeGreaterThan(0);
  });

  it.each(CATALOGO_FERRAMENTAS.map((f) => f.nome))('%s responde sem ciclo aberto, sem criar um', async (nome) => {
    const deps = criarDeps({ hoje: HOJE, ciclos: [] });
    const antes = fotografar(deps);

    const saida = await executarFerramenta(deps, nome, ARGUMENTOS[nome]);

    expect(saida).toBeDefined();
    expect(fotografar(deps)).toBe(antes);
    expect(deps.ciclos.criarChamadas).toBe(0);
  });
});

/**
 * Regressão de um caso real (11/08/2026): sem nenhum ciclo fechado, o copiloto
 * respondeu "seus custos fixos precisam estar registrados no app" com 12 custos
 * fixos cadastrados. A ferramenta só emitia `mesesDeReservaDesconhecido: true`,
 * um booleano sem causa, e o modelo preencheu a lacuna com a explicação mais
 * plausível — que era falsa. O contrato agora é: quando o número não existe, a
 * saída diz POR QUE ele não existe.
 */
describe('patrimonio_resumo — o desconhecido tem que vir com motivo', () => {
  function depsSemCicloFechado() {
    return criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtual()], // aberto, nunca fechado
      contas: [contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 6_000_000 })],
      custosFixos: [
        { id: 'cf1', nome: 'Aluguel', valorCents: 400_000, diaVencimento: 5, ativo: true, contaId: null, categoriaId: null, vigenteDe: null, vigenteAte: null },
        { id: 'cf2', nome: 'Internet', valorCents: 160_500, diaVencimento: 10, ativo: true, contaId: null, categoriaId: null, vigenteDe: null, vigenteAte: null },
      ],
      snapshots: [
        {
          id: 's1',
          data: '2026-07-01',
          totalCents: 6_000_000,
          itens: [{ id: 'i1', snapshotId: 's1', nome: 'Reserva', classe: 'RENDA_FIXA', valorCents: 6_000_000 , contaId: null }],
        },
      ],
    });
  }

  it('sem ciclo fechado: mesesDeReserva é null mas o motivo é explícito', async () => {
    const saida = await executarFerramenta(depsSemCicloFechado(), 'patrimonio_resumo', {});

    expect(saida.mesesDeReserva).toBeNull();
    expect(saida.motivoDesconhecido).toEqual(expect.stringContaining('ciclo'));
  });

  it('o motivo nunca culpa os custos fixos — foi essa a alucinação', async () => {
    const saida = await executarFerramenta(depsSemCicloFechado(), 'patrimonio_resumo', {});

    // O motivo fala de custo VARIÁVEL; qualquer texto sugerindo fixo ausente
    // é exatamente a resposta errada que apareceu em produção.
    expect(saida.motivoDesconhecido).toEqual(expect.stringContaining('VARIÁVEL'));
    expect(saida.custosFixosRegistrados).toBe(true);
  });

  it('a cobertura dos comprometidos é respondível sem nenhum ciclo fechado', async () => {
    const saida = await executarFerramenta(depsSemCicloFechado(), 'patrimonio_resumo', {});

    // fixos 400.000 + 160.500 = 560.500, sem provisão. 6.000.000 / 560.500 ≈ 10,7
    expect(saida.custoComprometidoMensalCents).toBe(560_500);
    expect(saida.mesesDeReservaComprometidos as number).toBeCloseTo(10.7, 1);
  });

  it('saldo de reserva zerado é sinalizado, não devolvido como 0,0 meses mudo', async () => {
    const deps = criarDeps({
      hoje: HOJE,
      ciclos: [cicloAtual()],
      contas: [contaFake({ id: 'reserva', tipo: 'RESERVA', saldoCents: 0 })],
      custosFixos: [
        { id: 'cf1', nome: 'Aluguel', valorCents: 400_000, diaVencimento: 5, ativo: true, contaId: null, categoriaId: null, vigenteDe: null, vigenteAte: null },
      ],
      snapshots: [
        {
          id: 's1',
          data: '2026-07-01',
          totalCents: 6_000_000,
          itens: [{ id: 'i1', snapshotId: 's1', nome: 'Reserva', classe: 'RENDA_FIXA', valorCents: 6_000_000 , contaId: null }],
        },
      ],
    });

    const saida = await executarFerramenta(deps, 'patrimonio_resumo', {});

    // O patrimônio existe (6M no snapshot) mas o saldo da conta é 0: sem o
    // aviso, o copiloto anunciaria "0 meses de reserva" com 60k no banco.
    expect(saida.mesesDeReservaComprometidos).toBe(0);
    expect(saida.saldoReservaZerado).toBe(true);
    expect(saida.avisoSaldoReserva).toEqual(expect.stringContaining('Ajustes'));
  });
});

/**
 * Regressão de um caso real (11/08/2026): o copiloto recebia `verbaVariavel`
 * como número atômico, sem renda, poupança, fixos nem provisão, e chutava de
 * onde ele vinha. A cura foi mandar as PARTES junto (D-15).
 *
 * Desde a D-16 (14/09/2026) o FATO virou o oposto — a meta de poupança NÃO é
 * descontada da verba, ela é objetivo e continua dentro dela —, e a lição é a
 * mesma: o que a composição diz sobre a meta precisa ser verdade, porque é
 * dela que o copiloto tira a frase.
 *
 * O estrago do erro continua sendo dupla contagem, agora pelo outro lado:
 * acreditar que a meta já saiu leva a separá-la OUTRA VEZ a partir da verba.
 */
describe('composição da verba — a meta de poupança NÃO é descontada (D-16)', () => {
  it.each(['estado_ciclo', 'projetar_ciclos'])(
    '%s expõe as parcelas que formam a verba',
    async (nome) => {
      const saida = await executarFerramenta(depsCompletos(), nome, ARGUMENTOS[nome]);
      // `projetar_ciclos` aninha por ciclo; `estado_ciclo` traz na raiz.
      const composicao = (saida.composicaoDaVerba ??
        (saida.ciclos as Record<string, unknown>[])[0]?.composicaoDaVerba) as
        | Record<string, unknown>
        | undefined;

      expect(composicao, `${nome} sem composicaoDaVerba`).toBeDefined();
      // O dinheiro da meta ainda está DENTRO da verba: `false` aqui seria o
      // copiloto dizendo ao dono que ele já separou o que não separou.
      expect(composicao?.metaDePoupancaJaEstaNaVerba).toBe(false);
      expect(composicao?.metaDePoupancaNaoDescontadaCents).toBeTypeOf('number');
      // A fórmula não cita mais a poupança — ela não é dedução (D-16).
      expect(composicao?.formula).toEqual(expect.stringContaining('renda − fixos − provisão'));
      expect(composicao?.formula).not.toEqual(expect.stringContaining('poupança'));
      // E a observação diz em texto o que o dono precisa fazer com a meta,
      // senão o número solto volta a ser lido como "já descontada".
      expect(composicao?.observacao).toEqual(expect.stringContaining('NÃO foi subtraída'));
    },
  );

  it('a composição bate exatamente com a verba variável do motor', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'estado_ciclo', {});
    const c = saida.composicaoDaVerba as Record<string, number | undefined>;
    const n = (campo: string): number => {
      const v = c[campo];
      expect(v, `composicaoDaVerba sem ${campo}`).toBeTypeOf('number');
      return v as number;
    };

    const recomposta =
      n('rendaCents') -
      n('fixosJaDescontadosCents') -
      n('provisaoJaDescontadaCents') +
      n('rolloverCents');

    expect(recomposta).toBe(saida.verbaVariavelCents);

    // A meta viaja junto da verba, mas FORA da conta (D-16). Descontá-la de
    // novo é exatamente a dupla contagem que a composição existe para impedir.
    expect(n('metaDePoupancaNaoDescontadaCents')).toBeGreaterThan(0);
    expect(recomposta - n('metaDePoupancaNaoDescontadaCents')).not.toBe(saida.verbaVariavelCents);
  });

  it('o rótulo não sugere que nada foi descontado', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'estado_ciclo', {});
    const rotulo = (saida.rotulos as Record<string, string>).verbaVariavel;

    // O rótulo antigo era 'verba do ciclo, antes de descontar parcela' — um
    // "antes de descontar" solto que o modelo leu como "nada foi descontado".
    expect(rotulo).toEqual(expect.stringContaining('JÁ descontados'));
  });
});

describe('rótulo de bolso — os três campos de verba (SPEC 13)', () => {
  it('estado_ciclo devolve verba variável, parcelas e verba livre, coerentes entre si', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'estado_ciclo', {});

    const verba = saida.verbaVariavelCents as number;
    const parcelas = saida.parcelasComprometidasCents as number;
    const livre = saida.verbaLivreCents as number;

    expect(parcelas).toBe(50_000);
    expect(livre).toBe(verba - parcelas);
    expect(saida.rotulos).toBeDefined();
  });

  it('projetar_ciclos devolve os três campos em cada ciclo', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'projetar_ciclos', { numCiclos: 3 });
    const ciclos = saida.ciclos as Record<string, number | undefined>[];

    expect(ciclos).toHaveLength(3);
    for (const ciclo of ciclos) {
      const verba = ciclo.verbaVariavelCents;
      const parcelas = ciclo.parcelasComprometidasCents;
      if (verba === undefined || parcelas === undefined) throw new Error('ciclo sem campos de verba');
      expect(ciclo.verbaLivreCents).toBe(verba - parcelas);
    }
  });
});

function depsNov(): FakeDeps {
  return criarDeps({
    hoje: '2026-11-10',
    config: { ...CONFIG_PADRAO, pisoDiarioVerbaCents: 15_000, diaRecebimento: 1 },
    ciclos: [
      cicloFake({
        id: 'nov',
        dataInicio: '2026-11-01',
        dataFim: '2026-11-30',
        rendaPrevistaCents: 3_000_000,
        fixosCents: 488_400,
        provisaoMensalCents: 0,
        verbaVariavelCents: 2_511_600,
        poupancaAlvoCents: 1_800_000,
      }),
    ],
  });
}

describe('simular_compra_parcelada', () => {
  it('a soma das parcelas adicionadas é exatamente o valor da compra', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'simular_compra_parcelada', {
      descricao: 'Notebook',
      valorTotalCents: 300_000,
      numParcelas: 10,
      dataCompra: '2026-08-10',
      numCiclos: 12,
    });

    const impacto = saida.impactoPorCiclo as Record<string, number>[];
    const soma = impacto.reduce((s, i) => s + (i.parcelaAdicionadaCents ?? 0), 0);

    expect(soma).toBe(300_000);
  });

  it('mês a mês nas duas verbas: parcela consome extras e reduz o dia a dia', async () => {
    const deps = depsNov();
    const saida = await executarFerramenta(deps, 'simular_compra_parcelada', {
      descricao: 'Notebook',
      valorTotalCents: 1_318_164,
      numParcelas: 3,
      dataCompra: '2026-11-10',
      numCiclos: null,
    });
    const impacto = saida.impactoPorCiclo as Record<string, unknown>[];

    expect(impacto[0]).toMatchObject(dinheiro('diaADiaDiarioDepois', 9_073));
    expect(saida.reduzDiaADia).toBe(true);
    expect(saida.alerta).toBe(`Essa compra vai reduzir seu dia a dia para ${formatBRL(8_406)}/dia`);
    expect(impacto[0]?.passouAReduzirDiaADia).toBe(true);
    expect(impacto[0]).toHaveProperty('variacaoExtrasRestanteCents');
    expect(JSON.stringify(saida.rotulos)).toContain('extrasRestante já é líquido das parcelas');
    expect(JSON.stringify(saida.rotulos)).toContain('negativo = a compra consumiu extras');
    expect(saida.truncado).toBe(false);
  });

  it('dataCompra 6 meses à frente: horizonte ancorado na compra, reduz e não trunca', async () => {
    const saida = await executarFerramenta(depsNov(), 'simular_compra_parcelada', {
      descricao: 'Notebook',
      valorTotalCents: 1_318_164,
      numParcelas: 3,
      dataCompra: '2027-05-10',
      numCiclos: null,
    });

    expect(saida.reduzDiaADia).toBe(true);
    expect(saida.alerta).not.toBeNull();
    expect(saida.truncado).toBe(false);
  });

  it('60 parcelas começando em janeiro (horizonte de 60 corta o fim): truncado true', async () => {
    const saida = await executarFerramenta(depsNov(), 'simular_compra_parcelada', {
      descricao: 'Carro',
      valorTotalCents: 6_000_000,
      numParcelas: 60,

      dataCompra: '2027-01-10',
      numCiclos: null,
    });

    expect(saida.truncado).toBe(true);
  });

  it('compra que só come extras: sem alerta e com motivoSemAlerta', async () => {
    const saida = await executarFerramenta(depsNov(), 'simular_compra_parcelada', {
      descricao: 'Fone',
      valorTotalCents: 300_000,
      numParcelas: 3,
      dataCompra: '2026-11-10',
      numCiclos: null,
    });

    expect(saida.reduzDiaADia).toBe(false);
    expect(saida.alerta).toBeNull();
    expect(saida.motivoSemAlerta).toContain('nenhum mês do horizonte teve o dia a dia reduzido');
  });

  it('usa hoje quando dataCompra vem null', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'simular_compra_parcelada', {
      ...(ARGUMENTOS.simular_compra_parcelada as object),
    });

    expect((saida.compra as { dataCompra: string }).dataCompra).toBe(HOJE);
  });
});

/**
 * Regressão de um caso real (11/08/2026): o dono pediu um plano para juntar
 * R$ 70.000,00 até janeiro e o copiloto respondeu DUAS VEZES que não tinha
 * ferramenta para isso — sendo que é aritmética sobre dados que o motor já
 * tem. A ferramenta nasceu daí.
 *
 * As baterias genéricas acima já provam que ela não grava, que tem
 * `comoFoiCalculado` e que todo `*Cents` tem `*Formatado`. O que falta, e é o
 * que este bloco cobre, é a saída carregar os campos que RESPONDEM à pergunta:
 * quanto por ciclo, quanto dá para acumular, se alcança, e quanto sobra ou
 * falta. Uma ferramenta que roda sem erro mas não responde a pergunta é pior
 * que ferramenta ausente — o modelo preenche o resto sozinho.
 */
describe('simular_meta_prazo — a saída responde a pergunta feita', () => {
  const ATE_OUTUBRO = { alvoCents: 300_000, dataLimite: '2026-10-31' };

  /**
   * Ciclo atual ESTOURADO: verba livre de R$ 1.000,00 contra R$ 1.500,00 já
   * gastos. Desde a D-16 o aporte de um ciclo é o que SOBRA da verba livre
   * depois do gasto (com teto na meta) — aqui não sobra nada, então o aporte
   * do ciclo atual é zero e a redução é a meta cheia. Só esse ciclo é afetado.
   */
  function depsCicloEstourado(): FakeDeps {
    return criarDeps({
      hoje: HOJE,
      ciclos: [
        cicloFake({
          id: 'ciclo-atual',
          dataInicio: '2026-07-05',
          dataFim: '2026-08-04',
          verbaVariavelCents: 100_000,
          poupancaAlvoCents: 100_000,
        }),
      ],
      transacoes: [
        transacaoFake({ id: 't1', data: '2026-07-10', valorCents: 150_000, cicloId: 'ciclo-atual' }),
      ],
    });
  }

  function ciclosDa(saida: Record<string, unknown>): Record<string, unknown>[] {
    return saida.ciclos as Record<string, unknown>[];
  }

  it('traz aporte por ciclo, total acumulável e o veredicto de alcance', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'simular_meta_prazo', ATE_OUTUBRO);

    for (const campo of [
      'aportePorCicloNecessarioCents',
      'aporteDisponivelPadraoCents',
      'sobraPorCicloCents',
      'totalAcumulavelCents',
      'alvoCents',
    ]) {
      expect(saida[campo], `simular_meta_prazo sem ${campo}`).toBeTypeOf('number');
    }
    expect(saida.alcanca).toBeTypeOf('boolean');
    expect(saida.numCiclos).toBeTypeOf('number');
    expect(saida.dataLimite).toBe('2026-10-31');
  });

  it('alcançando, devolve folga e NÃO devolve falta', async () => {
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', {
      alvoCents: 250_000,
      dataLimite: '2026-10-31',
    });

    // R$ 0,00 (ciclo estourado) + 3 × R$ 1.000,00 = R$ 3.000,00.
    expect(saida.alcanca).toBe(true);
    expect(saida.totalAcumulavelCents).toBe(300_000);
    expect(saida.folgaCents).toBe(50_000);
    // Emitir os dois deixaria o modelo escolher qual narrar.
    expect(saida.faltaCents).toBeUndefined();
  });

  it('não alcançando, devolve falta e NÃO devolve folga', async () => {
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', {
      alvoCents: 1_000_000,
      dataLimite: '2026-10-31',
    });

    expect(saida.alcanca).toBe(false);
    expect(saida.faltaCents).toBe(1_000_000 - 300_000);
    expect(saida.folgaCents).toBeUndefined();
  });

  it('a lista de ciclos recompõe o total (D-15): soma dos aportes = totalAcumulavel', async () => {
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', ATE_OUTUBRO);

    const soma = ciclosDa(saida).reduce((acc, c) => acc + (c.aportePrevistoCents as number), 0);

    expect(soma).toBe(saida.totalAcumulavelCents);
    expect(ciclosDa(saida)).toHaveLength(saida.numCiclos as number);
  });

  it('o ciclo atual estourado sai marcado, e só ele', async () => {
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', ATE_OUTUBRO);
    const ciclos = ciclosDa(saida);

    expect(ciclos[0]?.reduzidoPorGastoExcedente).toBe(true);
    // O gasto (R$ 1.500) passou da verba livre (R$ 1.000): não sobrou nada
    // para guardar neste ciclo. O aporte é zero, nunca negativo.
    expect(ciclos[0]?.aportePrevistoCents).toBe(0);
    expect(ciclos.slice(1).every((c) => c.reduzidoPorGastoExcedente === false)).toBe(true);
  });

  it('sem estouro, nenhum ciclo vem marcado', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'simular_meta_prazo', ATE_OUTUBRO);

    expect(ciclosDa(saida).every((c) => c.reduzidoPorGastoExcedente === false)).toBe(true);
  });

  it('a redução é EXPLICADA em texto, não deixada só como booleano (D-14)', async () => {
    // O rótulo é o que impede o modelo de inventar a causa da redução. Sem
    // ele, `reduzidoPorGastoExcedente: true` é um booleano mudo — foi
    // exatamente esse o defeito de `mesesDeReservaDesconhecido`.
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', ATE_OUTUBRO);
    const rotulos = saida.rotulos as Record<string, string>;

    expect(rotulos.aportePrevisto).toEqual(expect.stringContaining('reduzidoPorGastoExcedente'));
    // D-16: o rótulo não pode mais prometer que a redução só acontece em
    // estouro — o aporte é a sobra da verba livre com teto na meta, então ele
    // fica abaixo da meta sempre que a verba não chega lá.
    expect(rotulos.aportePrevisto).toEqual(expect.stringContaining('sobra da verba livre'));
    expect(rotulos.aportePrevisto).not.toEqual(expect.stringContaining('a poupança-alvo daquele ciclo'));
    expect(rotulos.aportePorCicloNecessario).toBeTypeOf('string');
    expect(rotulos.sobraPorCiclo).toBeTypeOf('string');
  });

  /**
   * D-15: número derivado viaja com suas partes. `aportePrevistoCents` do ciclo
   * reduzido é derivado (`poupancaAlvo − excedente`) e chegava SOZINHO — o
   * modelo conseguia dizer QUE reduziu, não DE QUANTO nem A PARTIR DE QUÊ, que
   * é justamente a pergunta seguinte do dono. Mesma falha da D-14, com o número
   * presente em vez de nulo.
   */
  it('o ciclo reduzido traz as partes: poupança-alvo original e a redução', async () => {
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', ATE_OUTUBRO);
    const atual = ciclosDa(saida)[0] ?? {};

    // R$ 1.000,00 de meta cheia, reduzidos nos R$ 1.000,00 inteiros: o gasto
    // comeu a verba livre toda e não sobrou sobra nenhuma para virar poupança.
    expect(atual.poupancaAlvoOriginalCents).toBe(100_000);
    expect(atual.reducaoPorExcedenteCents).toBe(100_000);
    // As partes recompõem o derivado — é isso que a D-15 exige.
    expect(atual.aportePrevistoCents).toBe(100_000 - 100_000);
  });

  /**
   * O motivo tem que estar em TEXTO e só no ciclo que de fato foi reduzido. Um
   * rótulo estático, idêntico nos dois casos, não informa nada — foi
   * exatamente assim que o `mesesDeReservaDesconhecido` levou o copiloto a
   * inventar a causa (D-14).
   */
  it('o motivo da redução vem em texto, e só no ciclo reduzido', async () => {
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', ATE_OUTUBRO);
    const ciclos = ciclosDa(saida);

    // `formatBRL` emite NBSP entre "R$" e o número — comparar com literal de
    // espaço comum falharia por byte, não por conteúdo.
    expect(ciclos[0]?.motivoReducao).toEqual(expect.stringContaining(formatBRL(100_000)));
    // O texto tem que dizer POR QUE o aporte encolheu sem repetir a regra
    // revogada: a meta não é descontada da verba (D-16).
    expect(ciclos[0]?.motivoReducao).toEqual(
      expect.stringContaining('A meta não é descontada da verba'),
    );
    expect(ciclos[1]?.motivoReducao).toBeUndefined();
    expect(ciclos[1]?.reducaoPorExcedenteCents).toBe(0);
  });

  it('prazo já vencido vira erro legível, nunca exceção que mata o loop', async () => {
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', {
      alvoCents: 300_000,
      dataLimite: '2026-06-01',
    });

    expect(saida.erro).toMatch(/anterior ao início do ciclo atual/i);
    expect(saida.ciclos).toBeUndefined();
  });

  it('alvo em reais (não centavos) é recusado como erro de argumento', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'simular_meta_prazo', {
      alvoCents: 70_000.5,
      dataLimite: '2027-01-31',
    });

    expect(saida.erro).toBeDefined();
    expect(saida.ciclos).toBeUndefined();
  });
});

describe('falhas viram retorno legível, nunca exceção', () => {
  it('ferramenta inexistente', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'ferramenta_que_nao_existe', {});

    expect(saida.erro).toMatch(/desconhecida/i);
  });

  it('argumento fora do schema', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'projetar_ciclos', { numCiclos: 3.5 });

    expect(saida.erro).toMatch(/inválidos/i);
  });

  it('argumento obrigatório ausente', async () => {
    const saida = await executarFerramenta(depsCompletos(), 'projetar_ciclos', {});

    expect(saida.erro).toMatch(/inválidos/i);
  });

  it('erro do caso de uso (Config ausente) não escapa', async () => {
    const deps = criarDeps({ hoje: HOJE, config: null });

    const saida = await executarFerramenta(deps, 'situacao_hoje', {});

    expect(saida.erro).toMatch(/não consegui obter esse dado/i);
  });
});

/**
 * Task 18 — poupança real, renda do ciclo e verbas separadas. Dados reais do
 * dono (nov/26): renda R$ 30.000, meta R$ 18.000, fixos R$ 4.884, piso R$ 150.
 */
describe('poupança real, renda do ciclo e verbas (Task 18)', () => {
  const CICLO_NOV = cicloFake({
    id: 'ciclo-nov',
    dataInicio: '2026-11-01',
    dataFim: '2026-11-30',
    rendaPrevistaCents: 3_000_000,
    poupancaAlvoCents: 1_800_000,
    fixosCents: 488_400,
    verbaVariavelCents: 2_511_600,
  });
  const CONFIG_DONO = { ...CONFIG_PADRAO, rendaBaseCents: 3_000_000, metaPoupancaCents: 1_800_000, pisoDiarioVerbaCents: 15_000 };

  function depsNov(extra: Partial<Parameters<typeof criarDeps>[0]> = {}): FakeDeps {
    return criarDeps({
      hoje: '2026-11-04',
      config: CONFIG_DONO,
      ciclos: [CICLO_NOV],
      transacoes: [
        transacaoFake({ id: 'tx-hoje', data: '2026-11-04', valorCents: 5_000, cicloId: CICLO_NOV.id }),
      ],
      contas: [contaFake({ saldoCents: 25_200_000 })],
      ...extra,
    });
  }

  it('poupanca_real sem snapshot no ciclo e sem lançamento em conta de patrimônio: null + motivo (D-14), não R$ 0', async () => {
    const deps = depsNov({
      contas: [contaFake({ saldoCents: 4_955_032 })],
      snapshots: [{ id: 's', data: '2026-10-31', totalCents: 6_000_000, itens: [] }],
    });
    const atual = (await executarFerramenta(deps, 'poupanca_real', {})).cicloAtual as Record<string, unknown>;

    expect(atual.guardadoEstimado).toBeNull();
    expect(atual.motivo).toMatch(/registre um snapshot/);
  });

  it('poupanca_real sem snapshot no ciclo estima pelo razão: efeito das transações do ciclo, não saldo − snapshot (D-13)', async () => {
    const deps = depsNov({
      contas: [contaFake({ saldoCents: 4_955_032 })],
      snapshots: [{ id: 's', data: '2026-10-31', totalCents: 6_000_000, itens: [] }],
    });
    deps.transacoes.itens.push(
      transacaoFake({ id: 'tx-aporte', tipo: 'RENDA', data: '2026-11-02', valorCents: 200_000, contaId: 'conta-x', cicloId: CICLO_NOV.id }),
    );
    const atual = (await executarFerramenta(deps, 'poupanca_real', {})).cicloAtual as Record<string, unknown>;

    expect(atual.guardadoEstimadoCents).toBe(200_000);
    expect(atual.fonte).toBe('SALDO_CONTAS');
    expect(atual.comoFoiEstimado).toMatch(/transações do ciclo/);
    expect(atual.diferencaParaMetaCents).toBe(200_000 - 1_800_000);
  });

  it('poupanca_real: fechados com real, sem real (motivo) e médias', async () => {
    const out = cicloFake({ id: 'out', dataInicio: '2026-10-01', dataFim: '2026-10-31', fechado: true, poupancaAlvoCents: 1_800_000, poupancaRealCents: 425_000 });
    const set = cicloFake({ id: 'set', dataInicio: '2026-09-01', dataFim: '2026-09-30', fechado: true, poupancaAlvoCents: 1_800_000 });
    const saida = await executarFerramenta(depsNov({ ciclos: [set, out, CICLO_NOV] }), 'poupanca_real', {});
    const fechados = saida.ultimosFechados as Record<string, unknown>[];

    expect(fechados[0]).toMatchObject({ inicio: '2026-10-01', realCents: 425_000, diferencaCents: -1_375_000 });
    expect(fechados[1]).toMatchObject({ inicio: '2026-09-01', real: null });
    expect(fechados[1]!.motivo).toEqual(expect.any(String));
    const medias = saida.medias as Record<string, unknown>[];
    expect(medias.map((m) => m.ciclos)).toEqual([3, 6, 12]);
    expect(medias[0]).toMatchObject({ mediaCents: 425_000, ciclosConsiderados: 1 });
  });

  it('renda_do_ciclo USD: decomposição em texto, imposto e renda real ainda null com motivo', async () => {
    const deps = depsNov({
      config: { ...CONFIG_DONO, moedaRenda: 'USD', rendaBrutaMoedaOrigemCents: 730_000, impostoEstimadoCents: 350_000 },
      ciclos: [{ ...CICLO_NOV, rendaPrevistaCents: 3_613_900, cotacaoPrevistaMicros: 5_430_000, cotacaoPrevistaData: '2026-10-30' }],
    });
    const saida = await executarFerramenta(deps, 'renda_do_ciclo', {});

    expect(saida.moeda).toBe('USD');
    expect(saida.decomposicao).toEqual(expect.stringContaining(formatBRL(3_613_900)));
    expect((saida.decomposicao as string).replace(/\u00a0/g, ' ')).toContain('R$ 36.139,00');
    expect(saida.impostoCents).toBe(350_000);
    expect(saida.liquidaCents).toBe(3_613_900);
    expect(saida.confirmada).toBe(false);
    expect(saida.rendaReal).toBeNull();
    expect(saida.motivoSemRendaReal).toEqual(expect.any(String));
  });

  it('estado_ciclo.verbas: fórmula, partes e dia a dia = piso × dias', async () => {
    const saida = await executarFerramenta(depsNov(), 'estado_ciclo', {});
    const verbas = saida.verbas as Record<string, unknown>;

    expect(verbas.formula).toEqual(expect.stringContaining('diaADia = min(piso × dias, max(0, gastável))'));
    expect(verbas.formula).toEqual(expect.stringContaining('faltaParaPiso = piso × dias − diaADia'));
    expect(verbas.formulaConsumo).toEqual(expect.stringContaining('diaADiaEfetivo = diaADia;'));
    expect(verbas.formulaConsumo).toEqual(expect.stringContaining('excedenteDosExtras = max(0, −extrasRestante)'));
    expect(verbas.diaADiaUsadoCents).toEqual(expect.any(Number));
    expect(verbas.diaADiaUsadoFormatado).toBe(formatBRL(verbas.diaADiaUsadoCents as number));
    expect(verbas.rotuloExtrasUsado).toEqual(expect.stringContaining('FIM do ciclo'));
    expect(verbas).toMatchObject({ diaADiaCents: 450_000, diaADiaFormatado: formatBRL(450_000) });
    expect(verbas).toMatchObject({ gastavelCents: 711_600, extrasCents: 261_600, metaDePoupancaJaEstaNaVerba: false });
    expect(JSON.stringify(verbas)).not.toMatch(/reservad/i);
  });

  it('situacao_hoje.verbas.podeGastarHojeDiaADia é o mesmo número do painel', async () => {
    const deps = depsNov();
    const saida = await executarFerramenta(deps, 'situacao_hoje', {});
    const painel = await obterEstadoPainelSomenteLeitura(deps);

    expect((saida.verbas as Record<string, unknown>).podeGastarHojeDiaADiaCents).toBe(painel!.kpis.podeGastarHojeCents);
    expect(saida.rotuloRestaHoje).toEqual(expect.stringContaining('podeGastarHojeDiaADia'));
  });

  it('dia a dia estourado hoje: copiloto diz 0, como o painel, e não um valor negativo', async () => {
    const deps = depsNov();
    deps.transacoes.itens.push(
      transacaoFake({ id: 'tx-estouro', data: '2026-11-04', valorCents: 900_000, cicloId: CICLO_NOV.id }),
    );
    const saida = await executarFerramenta(deps, 'situacao_hoje', {});
    const painel = await obterEstadoPainelSomenteLeitura(deps);

    expect(painel!.kpis.restaHojeCents).toBeLessThan(0);
    const v = saida.verbas as Record<string, unknown>;
    expect(v.podeGastarHojeDiaADiaCents).toBe(0);
    // D-15: o estouro viaja junto — teto, gasto de hoje e quanto passou.
    expect(v.tetoHojeDiaADiaCents).toBe(painel!.kpis.tetoHojeCents);
    expect(v.gastoHojeDiaADiaCents).toBe(painel!.kpis.gastoHojeCents);
    expect(v.excedidoHojeDiaADiaCents).toBe(-painel!.kpis.restaHojeCents);
    expect(v.excedidoHojeDiaADiaFormatado).toBe(formatBRL(-painel!.kpis.restaHojeCents));
    expect(v.rotuloPodeGastarHoje).toMatch(/excedidoHojeDiaADia/);
  });
});
