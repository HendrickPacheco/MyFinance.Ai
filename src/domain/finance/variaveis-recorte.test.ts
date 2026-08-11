/**
 * Fase 9 do TASKS-CUSTOS: o recorte de `/custos/variaveis`.
 *
 * O que estes testes protegem é a regra R4 — nada comprometido pode entrar no
 * total de verba variável — e o contrato de que quem FILTRA e quem SOMA olham
 * o mesmo conjunto.
 */
import { describe, it, expect } from 'vitest';
import {
  extratoTransacoesVariaveis,
  filtrarLinhasVariaveis,
  somarProgramadosCents,
  somarRealizadosCents,
  type LinhaTransacaoVariavelCalc,
  type TransacaoParaExtrato,
} from './agregacoes';

const linha = (over: Partial<LinhaTransacaoVariavelCalc>): LinhaTransacaoVariavelCalc => ({
  transacaoId: 'tx-1',
  data: '2026-08-10',
  descricao: 'Mercado',
  valorCents: 5000,
  categoriaId: 'cat-mercado',
  categoriaNome: 'Mercado',
  metodo: 'PIX',
  ehEstorno: false,
  ehProgramado: false,
  ...over,
});

describe('somarRealizadosCents', () => {
  it('lista vazia soma zero', () => {
    expect(somarRealizadosCents([])).toBe(0);
  });

  it('DESPESA soma e ESTORNO abate', () => {
    expect(
      somarRealizadosCents([
        linha({ valorCents: 5000 }),
        linha({ valorCents: 1200, ehEstorno: true }),
      ]),
    ).toBe(3800);
  });

  it('linha programada NÃO entra no total realizado', () => {
    expect(
      somarRealizadosCents([
        linha({ valorCents: 5000 }),
        linha({ valorCents: 9900, ehProgramado: true }),
      ]),
    ).toBe(5000);
  });

  it('realizado e programado são conjuntos disjuntos — juntos dão o bruto', () => {
    const linhas = [
      linha({ valorCents: 5000 }),
      linha({ valorCents: 1200, ehEstorno: true }),
      linha({ valorCents: 9900, ehProgramado: true }),
      linha({ valorCents: 400, ehProgramado: true, ehEstorno: true }),
    ];
    expect(somarRealizadosCents(linhas)).toBe(3800);
    expect(somarProgramadosCents(linhas)).toBe(9500);
  });
});

describe('filtrarLinhasVariaveis', () => {
  const linhas = [
    linha({ transacaoId: 'a', categoriaId: 'cat-mercado', metodo: 'PIX' }),
    linha({ transacaoId: 'b', categoriaId: 'cat-lazer', metodo: 'CREDITO' }),
    linha({ transacaoId: 'c', categoriaId: 'cat-mercado', metodo: null }),
  ];

  it('filtro vazio devolve tudo', () => {
    expect(filtrarLinhasVariaveis(linhas, {}).map((l) => l.transacaoId)).toEqual(['a', 'b', 'c']);
  });

  it('filtra por categoria', () => {
    expect(
      filtrarLinhasVariaveis(linhas, { categoriaId: 'cat-mercado' }).map((l) => l.transacaoId),
    ).toEqual(['a', 'c']);
  });

  it('filtra por método, e linha sem método some quando um método é escolhido', () => {
    expect(filtrarLinhasVariaveis(linhas, { metodo: 'PIX' }).map((l) => l.transacaoId)).toEqual([
      'a',
    ]);
  });

  it('categoria e método combinam (E, não OU)', () => {
    expect(
      filtrarLinhasVariaveis(linhas, { categoriaId: 'cat-mercado', metodo: 'CREDITO' }),
    ).toEqual([]);
  });

  it('`null` significa "todos", não "sem valor informado"', () => {
    expect(filtrarLinhasVariaveis(linhas, { categoriaId: null, metodo: null })).toHaveLength(3);
  });

  it('não muda a ordem que o extrato entregou', () => {
    const invertidas = [...linhas].reverse();
    expect(filtrarLinhasVariaveis(invertidas, {}).map((l) => l.transacaoId)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });
});

describe('R4 — o total do recorte nunca inclui dinheiro comprometido', () => {
  const base: TransacaoParaExtrato = {
    transacaoId: 'tx-base',
    data: '2026-08-10',
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

  it('parcela e gasto de provisão não entram na lista nem no total', () => {
    const transacoes: TransacaoParaExtrato[] = [
      base,
      { ...base, transacaoId: 'tx-parcela', parcelamentoId: 'parc-1', valorCents: 29158 },
      { ...base, transacaoId: 'tx-provisao', provisaoId: 'prov-1', valorCents: 80000 },
      { ...base, transacaoId: 'tx-fixo', grupoCategoria: 'FIXO', valorCents: 120000 },
    ];

    const linhas = filtrarLinhasVariaveis(
      extratoTransacoesVariaveis(transacoes, '2026-08-31', { ate: '2026-08-31' }),
      {},
    );

    expect(linhas.map((l) => l.transacaoId)).toEqual(['tx-base']);
    expect(somarRealizadosCents(linhas)).toBe(5000);
  });
});
