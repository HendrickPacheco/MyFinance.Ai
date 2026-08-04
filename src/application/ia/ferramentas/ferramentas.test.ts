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
