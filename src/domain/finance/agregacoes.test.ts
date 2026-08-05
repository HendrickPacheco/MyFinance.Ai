import { describe, it, expect } from 'vitest';
import {
  calcularPercentuais,
  percentualDeAlvo,
  agregarGastoPorCategoria,
  agregarSaidaPorMetodo,
  sobraProjetadaCents,
  somarParceladosCents,
  gastoVariavelSemParcelasCents,
  extratoTransacoesVariaveis,
  somarProgramadosCents,
  projetarPoupanca,
  formatarPeriodoCiclo,
  type TransacaoCategorizada,
  type TransacaoComMetodo,
  type TransacaoComParcela,
  type TransacaoParaExtrato,
} from './agregacoes';
import { gastoRealizadoCents } from './teto';

describe('calcularPercentuais', () => {
  it('lista vazia devolve lista vazia', () => {
    expect(calcularPercentuais([])).toEqual([]);
  });

  it('total zero devolve zero para todas as posições, sem dividir por zero', () => {
    expect(calcularPercentuais([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('reparte 100% exatamente usando o método do maior resto', () => {
    const percentuais = calcularPercentuais([100, 100, 100]);
    expect(percentuais.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    expect(percentuais).toEqual([33.4, 33.3, 33.3]);
  });

  it('um único valor fica com 100%', () => {
    expect(calcularPercentuais([500])).toEqual([100]);
  });

  it('soma continua ~100 mesmo com valores desproporcionais', () => {
    const percentuais = calcularPercentuais([1, 2, 9997]);
    expect(percentuais.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it('lida com estorno maior que despesa (total negativo) sem NaN/Infinity', () => {
    const percentuais = calcularPercentuais([-500, 1500]);
    for (const p of percentuais) {
      expect(Number.isFinite(p)).toBe(true);
    }
    expect(percentuais.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });
});

describe('percentualDeAlvo', () => {
  it('alvo zero ou negativo devolve 0 (nunca divide por zero)', () => {
    expect(percentualDeAlvo(500, 0)).toBe(0);
    expect(percentualDeAlvo(500, -100)).toBe(0);
  });

  it('calcula progresso com uma casa decimal', () => {
    expect(percentualDeAlvo(50, 200)).toBe(25);
    expect(percentualDeAlvo(33, 100)).toBe(33);
  });

  it('nunca ultrapassa 100 nem fica abaixo de 0', () => {
    expect(percentualDeAlvo(1000, 100)).toBe(100);
    expect(percentualDeAlvo(-1000, 100)).toBe(0);
  });
});

describe('agregarGastoPorCategoria', () => {
  const categorias = [
    { id: 'cat-mercado', nome: 'Mercado' },
    { id: 'cat-lazer', nome: 'Lazer' },
  ];

  /** Corte depois de tudo: isola os casos que não são sobre data. */
  const ATE_FIM = '2026-08-31';

  it('lista vazia devolve lista vazia', () => {
    expect(agregarGastoPorCategoria([], categorias, ATE_FIM)).toEqual([]);
  });

  it('soma DESPESA e abate ESTORNO, ignora RENDA/TRANSFERENCIA e provisão', () => {
    const transacoes: TransacaoCategorizada[] = [
      { data: '2026-08-01', valorCents: 5000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-mercado' },
      { data: '2026-08-02', valorCents: 1000, tipo: 'ESTORNO', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-mercado' },
      { data: '2026-08-03', valorCents: 2000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-lazer' },
      { data: '2026-08-04', valorCents: 999999, tipo: 'RENDA', grupoCategoria: 'RENDA', categoriaId: null },
      { data: '2026-08-05', valorCents: 300, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-lazer', provisaoId: 'prov-1' },
    ];

    const resultado = agregarGastoPorCategoria(transacoes, categorias, ATE_FIM);

    expect(resultado).toEqual([
      { categoriaId: 'cat-mercado', nome: 'Mercado', totalCents: 4000, percentual: 66.7 },
      { categoriaId: 'cat-lazer', nome: 'Lazer', totalCents: 2000, percentual: 33.3 },
    ]);
  });

  it('categoria ausente do cadastro vira "Categoria removida"', () => {
    const transacoes: TransacaoCategorizada[] = [
      { data: '2026-08-01', valorCents: 1000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-inexistente' },
    ];
    const resultado = agregarGastoPorCategoria(transacoes, categorias, ATE_FIM);
    expect(resultado).toEqual([
      { categoriaId: 'cat-inexistente', nome: 'Categoria removida', totalCents: 1000, percentual: 100 },
    ]);
  });

  it('transação sem categoria vira o bucket "Sem categoria"', () => {
    const transacoes: TransacaoCategorizada[] = [
      { data: '2026-08-01', valorCents: 1000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: null },
    ];
    const resultado = agregarGastoPorCategoria(transacoes, categorias, ATE_FIM);
    expect(resultado[0]?.nome).toBe('Sem categoria');
    expect(resultado[0]?.totalCents).toBe(1000);
  });

  it('estorno maior que a despesa produz total negativo, sem quebrar', () => {
    const transacoes: TransacaoCategorizada[] = [
      { data: '2026-08-01', valorCents: 1000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-mercado' },
      { data: '2026-08-02', valorCents: 3000, tipo: 'ESTORNO', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-mercado' },
    ];
    const resultado = agregarGastoPorCategoria(transacoes, categorias, ATE_FIM);
    expect(resultado).toEqual([
      { categoriaId: 'cat-mercado', nome: 'Mercado', totalCents: -2000, percentual: 100 },
    ]);
  });

  it('competência futura fica fora da fatia (corte lexicográfico em ateData)', () => {
    const transacoes: TransacaoCategorizada[] = [
      { data: '2026-08-04', valorCents: 1000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-mercado' },
      { data: '2026-08-05', valorCents: 500, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-mercado' },
      { data: '2026-08-10', valorCents: 78336, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-lazer' },
    ];

    const resultado = agregarGastoPorCategoria(transacoes, categorias, '2026-08-05');

    // A do dia 10 sumiu; a de hoje (05) ficou — o corte é `>`, não `>=`.
    expect(resultado).toEqual([
      { categoriaId: 'cat-mercado', nome: 'Mercado', totalCents: 1500, percentual: 100 },
    ]);
  });

  it('o total das fatias bate exatamente com gastoRealizadoCents (a pizza é a decomposição do KPI)', () => {
    const hoje = '2026-08-05';
    const transacoes: TransacaoCategorizada[] = [
      { data: '2026-08-01', valorCents: 5000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-mercado' },
      { data: '2026-08-02', valorCents: 1000, tipo: 'ESTORNO', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-mercado' },
      { data: '2026-08-03', valorCents: 2000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-lazer' },
      { data: '2026-08-04', valorCents: 900, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-lazer', provisaoId: 'prov-1' },
      { data: '2026-08-10', valorCents: 78336, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', categoriaId: 'cat-lazer' },
    ];

    const totalDasFatias = agregarGastoPorCategoria(transacoes, categorias, hoje).reduce(
      (soma, f) => soma + f.totalCents,
      0,
    );

    expect(totalDasFatias).toBe(gastoRealizadoCents(transacoes, hoje));
    expect(totalDasFatias).toBe(6000);
  });

  it('rejeita data de corte mal formada', () => {
    expect(() => agregarGastoPorCategoria([], categorias, '2026-8-05')).toThrow(TypeError);
  });
});

describe('agregarSaidaPorMetodo', () => {
  it('lista vazia devolve lista vazia', () => {
    expect(agregarSaidaPorMetodo([])).toEqual([]);
  });

  it('agrega DESPESA/ESTORNO por método, inclusive método nulo', () => {
    const transacoes: TransacaoComMetodo[] = [
      { tipo: 'DESPESA', valorCents: 4000, metodo: 'PIX' },
      { tipo: 'DESPESA', valorCents: 1000, metodo: null },
      { tipo: 'ESTORNO', valorCents: 500, metodo: 'PIX' },
      { tipo: 'RENDA', valorCents: 500000, metodo: null },
      { tipo: 'TRANSFERENCIA', valorCents: 20000, metodo: 'DEBITO' },
    ];

    const resultado = agregarSaidaPorMetodo(transacoes);

    expect(resultado).toEqual([
      { metodo: 'PIX', totalCents: 3500, percentual: 77.8 },
      { metodo: null, totalCents: 1000, percentual: 22.2 },
    ]);
  });

  it('não inclui fixo/parcelado/provisão fora do escopo: soma tudo que é DESPESA/ESTORNO', () => {
    const transacoes: TransacaoComMetodo[] = [
      { tipo: 'DESPESA', valorCents: 10000, metodo: 'BOLETO' },
    ];
    expect(agregarSaidaPorMetodo(transacoes)).toEqual([
      { metodo: 'BOLETO', totalCents: 10000, percentual: 100 },
    ]);
  });
});

describe('sobraProjetadaCents', () => {
  it('sobra positiva quando a projeção fica abaixo da verba', () => {
    expect(
      sobraProjetadaCents({
        verbaVariavelCents: 100000,
        ritmo: { projecaoFechamentoCents: 80000 },
      }),
    ).toBe(20000);
  });

  it('sobra pode ser negativa (projeta déficit) e é arredondada para Int', () => {
    expect(
      sobraProjetadaCents({
        verbaVariavelCents: 100000,
        ritmo: { projecaoFechamentoCents: 100000.6 },
      }),
    ).toBe(-1);
  });
});

describe('somarParceladosCents', () => {
  it('ciclo sem parcelas devolve zero', () => {
    expect(somarParceladosCents([])).toBe(0);
    expect(
      somarParceladosCents([{ valorCents: 5000, parcelamentoId: null }]),
    ).toBe(0);
  });

  it('soma só as transações com parcelamentoId, ignora o resto', () => {
    const transacoes = [
      { valorCents: 10000, parcelamentoId: 'parc-1' },
      { valorCents: 5000, parcelamentoId: null },
      { valorCents: 20000, parcelamentoId: 'parc-2' },
      { valorCents: 300, parcelamentoId: undefined },
    ];
    expect(somarParceladosCents(transacoes)).toBe(30000);
  });

  it('não filtra por data — parcela futura dentro do ciclo entra inteira', () => {
    const transacoes = [{ valorCents: 15000, parcelamentoId: 'parc-1' }];
    expect(somarParceladosCents(transacoes)).toBe(15000);
  });
});

describe('gastoVariavelSemParcelasCents', () => {
  it('ciclo sem transações devolve zero', () => {
    expect(gastoVariavelSemParcelasCents([], '2026-08-31')).toBe(0);
  });

  it('exclui transações de parcelamento para não contar em dobro com somarParceladosCents', () => {
    const transacoes: TransacaoComParcela[] = [
      {
        data: '2026-08-05',
        valorCents: 10000,
        tipo: 'DESPESA',
        grupoCategoria: 'VARIAVEL',
        parcelamentoId: 'parc-1',
      },
      {
        data: '2026-08-05',
        valorCents: 3000,
        tipo: 'DESPESA',
        grupoCategoria: 'VARIAVEL',
        parcelamentoId: null,
      },
    ];
    expect(gastoVariavelSemParcelasCents(transacoes, '2026-08-31')).toBe(3000);
  });

  it('ignora provisão e grupos não-VARIAVEL, mesmo sem parcelamentoId', () => {
    const transacoes: TransacaoComParcela[] = [
      {
        data: '2026-08-05',
        valorCents: 10000,
        tipo: 'DESPESA',
        grupoCategoria: 'VARIAVEL',
        provisaoId: 'prov-1',
        parcelamentoId: null,
      },
      {
        data: '2026-08-05',
        valorCents: 5000,
        tipo: 'DESPESA',
        grupoCategoria: 'FIXO',
        parcelamentoId: null,
      },
    ];
    expect(gastoVariavelSemParcelasCents(transacoes, '2026-08-31')).toBe(0);
  });

  it('respeita a data de corte (comparação lexicográfica) e abate ESTORNO', () => {
    const transacoes: TransacaoComParcela[] = [
      { data: '2026-08-01', valorCents: 2000, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL' },
      { data: '2026-08-02', valorCents: 500, tipo: 'ESTORNO', grupoCategoria: 'VARIAVEL' },
      { data: '2026-08-10', valorCents: 999999, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL' },
    ];
    expect(gastoVariavelSemParcelasCents(transacoes, '2026-08-02')).toBe(1500);
  });

  it('rejeita data de corte mal formada', () => {
    expect(() => gastoVariavelSemParcelasCents([], '2026-08-1')).toThrow(TypeError);
  });
});

describe('extratoTransacoesVariaveis', () => {
  const base: TransacaoParaExtrato = {
    transacaoId: 'tx-x',
    data: '2026-08-01',
    valorCents: 5000,
    tipo: 'DESPESA',
    grupoCategoria: 'VARIAVEL',
    provisaoId: null,
    parcelamentoId: null,
    descricao: 'Mercado',
    categoriaId: 'cat-mercado',
    categoriaNome: 'Mercado',
    metodo: 'PIX',
  };

  it('ciclo sem nenhuma transação devolve extrato vazio', () => {
    expect(extratoTransacoesVariaveis([], '2026-08-31')).toEqual([]);
  });

  it('só parcelas: extrato vem vazio (parcela tem tabela própria, não entra aqui)', () => {
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-parcela', parcelamentoId: 'parc-1' },
    ];
    expect(extratoTransacoesVariaveis(transacoes, '2026-08-31')).toEqual([]);
  });

  it('inclui DESPESA e ESTORNO marcando ehEstorno, mais recente primeiro', () => {
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-1', data: '2026-08-01', tipo: 'DESPESA' },
      { ...base, transacaoId: 'tx-2', data: '2026-08-05', tipo: 'ESTORNO' },
    ];
    const resultado = extratoTransacoesVariaveis(transacoes, '2026-08-31');
    expect(resultado.map((l) => l.transacaoId)).toEqual(['tx-2', 'tx-1']);
    expect(resultado.find((l) => l.transacaoId === 'tx-2')?.ehEstorno).toBe(true);
    expect(resultado.find((l) => l.transacaoId === 'tx-1')?.ehEstorno).toBe(false);
  });

  it('exclui gasto de provisão, RENDA e TRANSFERENCIA', () => {
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-provisao', provisaoId: 'prov-1' },
      { ...base, transacaoId: 'tx-renda', tipo: 'RENDA', grupoCategoria: 'RENDA' },
      { ...base, transacaoId: 'tx-transferencia', tipo: 'TRANSFERENCIA', grupoCategoria: null },
    ];
    expect(extratoTransacoesVariaveis(transacoes, '2026-08-31')).toEqual([]);
  });

  it('transação sem categoria (categoriaId/grupoCategoria null) é excluída — mesma regra de contaComoVerbaVariavel', () => {
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-sem-categoria', categoriaId: null, categoriaNome: null, grupoCategoria: null },
    ];
    expect(extratoTransacoesVariaveis(transacoes, '2026-08-31')).toEqual([]);
  });

  it('sem `ate`, o corte é o próprio hoje (comparação lexicográfica)', () => {
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-dentro', data: '2026-08-02' },
      { ...base, transacaoId: 'tx-fora', data: '2026-08-10' },
    ];
    const resultado = extratoTransacoesVariaveis(transacoes, '2026-08-02');
    expect(resultado.map((l) => l.transacaoId)).toEqual(['tx-dentro']);
  });

  it('com `ate` = fim do ciclo, competência futura ENTRA marcada com ehProgramado', () => {
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-hoje', data: '2026-08-05' },
      { ...base, transacaoId: 'tx-futura', data: '2026-08-10' },
      { ...base, transacaoId: 'tx-fora-do-ciclo', data: '2026-09-10' },
    ];
    const resultado = extratoTransacoesVariaveis(transacoes, '2026-08-05', { ate: '2026-08-31' });

    expect(resultado.map((l) => l.transacaoId)).toEqual(['tx-futura', 'tx-hoje']);
    expect(resultado.find((l) => l.transacaoId === 'tx-futura')?.ehProgramado).toBe(true);
    // Competência de hoje é realizada, não programada (o corte é `>`, não `>=`).
    expect(resultado.find((l) => l.transacaoId === 'tx-hoje')?.ehProgramado).toBe(false);
  });

  it('rejeita data mal formada em hoje e em `ate`', () => {
    expect(() => extratoTransacoesVariaveis([], '2026-08-1')).toThrow(TypeError);
    expect(() => extratoTransacoesVariaveis([], '2026-08-01', { ate: '2026-8-31' })).toThrow(
      TypeError,
    );
  });

  it('o total líquido do extrato (estorno maior que despesa, negativo) bate exatamente com gastoVariavelSemParcelasCents', () => {
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-1', tipo: 'DESPESA', valorCents: 1000, data: '2026-08-01' },
      { ...base, transacaoId: 'tx-2', tipo: 'ESTORNO', valorCents: 3000, data: '2026-08-02' },
    ];
    const ateData = '2026-08-31';

    const totalDoExtrato = extratoTransacoesVariaveis(transacoes, ateData).reduce(
      (soma, l) => soma + (l.ehEstorno ? -l.valorCents : l.valorCents),
      0,
    );

    expect(totalDoExtrato).toBe(-2000);
    expect(totalDoExtrato).toBe(gastoVariavelSemParcelasCents(transacoes, ateData));
  });

  it('a soma do extrato bate com gastoVariavelSemParcelasCents também com parcelas e provisão misturadas', () => {
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-variavel', tipo: 'DESPESA', valorCents: 4000, data: '2026-08-01' },
      { ...base, transacaoId: 'tx-parcela', valorCents: 30000, data: '2026-08-03', parcelamentoId: 'parc-1' },
      { ...base, transacaoId: 'tx-provisao', valorCents: 9000, data: '2026-08-04', provisaoId: 'prov-1' },
    ];
    const ateData = '2026-08-31';

    const totalDoExtrato = extratoTransacoesVariaveis(transacoes, ateData).reduce(
      (soma, l) => soma + (l.ehEstorno ? -l.valorCents : l.valorCents),
      0,
    );

    expect(totalDoExtrato).toBe(gastoVariavelSemParcelasCents(transacoes, ateData));
    expect(totalDoExtrato).toBe(4000);
  });

  it('linha programada aparece no extrato mas NÃO entra no total realizado', () => {
    const hoje = '2026-08-05';
    const transacoes: TransacaoParaExtrato[] = [
      { ...base, transacaoId: 'tx-realizada', valorCents: 4000, data: '2026-08-04' },
      { ...base, transacaoId: 'tx-programada', valorCents: 78336, data: '2026-08-10' },
    ];

    const linhas = extratoTransacoesVariaveis(transacoes, hoje, { ate: '2026-08-31' });

    expect(linhas).toHaveLength(2);
    // O total realizado (o que consome verba) segue ignorando a futura.
    expect(gastoVariavelSemParcelasCents(transacoes, hoje)).toBe(4000);
    expect(somarProgramadosCents(linhas)).toBe(78336);
  });
});

describe('somarProgramadosCents', () => {
  const linha = { valorCents: 1000, ehEstorno: false, ehProgramado: true };

  it('lista vazia soma zero', () => {
    expect(somarProgramadosCents([])).toBe(0);
  });

  it('ignora linhas realizadas', () => {
    expect(somarProgramadosCents([{ ...linha, ehProgramado: false }])).toBe(0);
  });

  it('estorno programado abate', () => {
    expect(
      somarProgramadosCents([linha, { valorCents: 300, ehEstorno: true, ehProgramado: true }]),
    ).toBe(700);
  });
});

describe('projetarPoupanca', () => {
  it('sobra projetada zero: poupança projetada fica exatamente no alvo (100%)', () => {
    const resultado = projetarPoupanca({ poupancaAlvoCents: 1_800_000, sobraProjetadaCents: 0 });
    expect(resultado.poupancaProjetadaCents).toBe(1_800_000);
    expect(resultado.progressoPercentual).toBe(100);
  });

  it('ciclo com estouro de verba (sobra projetada negativa) projeta poupança MENOR que o alvo', () => {
    const resultado = projetarPoupanca({
      poupancaAlvoCents: 1_800_000,
      sobraProjetadaCents: -50_000,
    });
    expect(resultado.poupancaProjetadaCents).toBe(1_750_000);
    expect(resultado.progressoPercentual).toBeLessThan(100);
    expect(resultado.progressoPercentual).toBeCloseTo(97.2, 1);
  });

  it('ciclo recém-aberto sem gasto ainda registrado, mas com verba já negativa (déficit — modo recuperação), NÃO dá 100%', () => {
    // Fixos + poupança + provisão > renda: a verba nasce negativa, e com
    // zero gasto realizado a sobra projetada é a própria verba (negativa).
    // Ao contrário do `Math.max(alvo + saldoDisponivel, 0)` antigo — que
    // escondia o tamanho real do déficit atrás de um piso em zero —, a
    // projeção aqui preserva o valor negativo.
    const resultado = projetarPoupanca({
      poupancaAlvoCents: 1_800_000,
      sobraProjetadaCents: -500_000,
    });
    expect(resultado.poupancaProjetadaCents).toBe(1_300_000);
    expect(resultado.progressoPercentual).toBeLessThan(100);
  });

  it('deficit maior que o alvo fica negativo, sem piso em zero (nunca esconde o tamanho do rombo)', () => {
    const resultado = projetarPoupanca({
      poupancaAlvoCents: 1_800_000,
      sobraProjetadaCents: -2_500_000,
    });
    expect(resultado.poupancaProjetadaCents).toBe(-700_000);
    expect(resultado.progressoPercentual).toBe(0);
  });

  it('sobra projetada positiva soma ao alvo; progresso fica limitado em 100% (sem dados de estouro, não há como diferenciar de saldo não-gasto)', () => {
    const resultado = projetarPoupanca({
      poupancaAlvoCents: 1_800_000,
      sobraProjetadaCents: 700_000,
    });
    expect(resultado.poupancaProjetadaCents).toBe(2_500_000);
    expect(resultado.progressoPercentual).toBe(100);
  });

  it('alvo zero não divide por zero — progresso sempre 0', () => {
    const resultado = projetarPoupanca({ poupancaAlvoCents: 0, sobraProjetadaCents: 10_000 });
    expect(resultado.poupancaProjetadaCents).toBe(10_000);
    expect(resultado.progressoPercentual).toBe(0);
  });
});

describe('formatarPeriodoCiclo', () => {
  it('formata o rótulo pt-BR do período', () => {
    expect(formatarPeriodoCiclo('2026-08-01', '2026-08-31')).toBe('1 ago — 31 ago');
  });

  it('funciona atravessando virada de mês/ano', () => {
    expect(formatarPeriodoCiclo('2026-12-05', '2027-01-04')).toBe('5 dez — 4 jan');
  });

  it('rejeita data mal formada', () => {
    expect(() => formatarPeriodoCiclo('2026-08-1', '2026-08-31')).toThrow(TypeError);
  });
});
