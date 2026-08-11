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
  criarDeps,
  cicloFake,
  contaFake,
  transacaoFake,
  type FakeDeps,
} from '@/application/__fakes__/fakes-ciclo-fechamento';
import { CATALOGO_FERRAMENTAS } from './catalogo';
import { NOMES_DE_FERRAMENTA, executarFerramenta } from './index';

const HOJE = '2026-07-20';

function cicloAtual() {
  return cicloFake({ id: 'ciclo-atual', dataInicio: '2026-07-05', dataFim: '2026-08-04' });
}

function depsCompletos(): FakeDeps {
  return criarDeps({
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
}

/** Argumentos válidos mínimos por ferramenta. */
const ARGUMENTOS: Record<string, unknown> = {
  situacao_hoje: {},
  estado_ciclo: {},
  gastos_por_categoria: { limite: null },
  pagamentos_pendentes: {},
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
        { id: 'cf1', nome: 'Aluguel', valorCents: 400_000, diaVencimento: 5, ativo: true, contaId: null, vigenteDe: null, vigenteAte: null },
        { id: 'cf2', nome: 'Internet', valorCents: 160_500, diaVencimento: 10, ativo: true, contaId: null, vigenteDe: null, vigenteAte: null },
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
        { id: 'cf1', nome: 'Aluguel', valorCents: 400_000, diaVencimento: 5, ativo: true, contaId: null, vigenteDe: null, vigenteAte: null },
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
 * Regressão de um caso real (11/08/2026): o dono afirmou que a meta de poupança
 * já sai da verba — está certo, é a fórmula de `verbaVariavelCents` — e o
 * copiloto respondeu "Não é assim na projeção atual". Ele não tinha como saber:
 * recebia `verbaVariavel` como número atômico, sem renda, poupança, fixos nem
 * provisão, e o rótulo dizia "antes de descontar parcela" — o que sugere que
 * nada foi descontado.
 *
 * O estrago do erro é dupla contagem: acreditar nele levaria a separar a meta
 * OUTRA VEZ a partir da verba livre.
 */
describe('composição da verba — a meta de poupança já está descontada', () => {
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
      expect(composicao?.metaDePoupancaJaEstaNaVerba).toBe(true);
      expect(composicao?.poupancaJaDescontadaCents).toBeTypeOf('number');
      expect(composicao?.formula).toEqual(expect.stringContaining('poupança'));
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
      n('poupancaJaDescontadaCents') -
      n('fixosJaDescontadosCents') -
      n('provisaoJaDescontadaCents') +
      n('rolloverCents');

    expect(recomposta).toBe(saida.verbaVariavelCents);
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
   * Ciclo atual ESTOURADO: verba de R$ 1.000,00 contra R$ 1.500,00 já gastos.
   * O excedente de R$ 500,00 sai da poupança daquele ciclo, e só dele.
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
    const saida = await executarFerramenta(depsCicloEstourado(), 'simular_meta_prazo', ATE_OUTUBRO);

    // R$ 500,00 (ciclo estourado) + 3 × R$ 1.000,00 = R$ 3.500,00 contra alvo
    // de R$ 3.000,00.
    expect(saida.alcanca).toBe(true);
    expect(saida.totalAcumulavelCents).toBe(350_000);
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
    expect(saida.faltaCents).toBe(1_000_000 - 350_000);
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
    expect(ciclos[0]?.aportePrevistoCents).toBe(50_000);
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
    expect(rotulos.aportePrevisto).toEqual(expect.stringContaining('estourou a verba variável'));
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

    // R$ 1.000,00 de poupança-alvo, reduzidos em R$ 500,00 de excedente.
    expect(atual.poupancaAlvoOriginalCents).toBe(100_000);
    expect(atual.reducaoPorExcedenteCents).toBe(50_000);
    // As partes recompõem o derivado — é isso que a D-15 exige.
    expect(atual.aportePrevistoCents).toBe(100_000 - 50_000);
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
    expect(ciclos[0]?.motivoReducao).toEqual(expect.stringContaining(formatBRL(50_000)));
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
