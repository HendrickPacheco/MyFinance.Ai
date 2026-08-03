import { describe, it, expect } from 'vitest';
import { ordenarCategoriasPorUso, type CategoriaOrdenavel, type TransacaoParaFrequencia } from './categorias';

const MERCADO: CategoriaOrdenavel & { id: string } = { id: 'cat-mercado', grupo: 'VARIAVEL', ordem: 2 };
const LAZER: CategoriaOrdenavel & { id: string } = { id: 'cat-lazer', grupo: 'VARIAVEL', ordem: 1 };
const TRANSPORTE: CategoriaOrdenavel & { id: string } = { id: 'cat-transporte', grupo: 'VARIAVEL', ordem: 3 };
const ALUGUEL: CategoriaOrdenavel & { id: string } = { id: 'cat-aluguel', grupo: 'FIXO', ordem: 1 };
const SALARIO: CategoriaOrdenavel & { id: string } = { id: 'cat-salario', grupo: 'RENDA', ordem: 1 };

describe('ordenarCategoriasPorUso', () => {
  it('ciclo sem nenhuma transação: VARIAVEL por ordem de cadastro, seguido do resto por ordem', () => {
    const resultado = ordenarCategoriasPorUso([MERCADO, LAZER, TRANSPORTE, ALUGUEL, SALARIO], []);
    expect(resultado.map((c) => c.id)).toEqual([
      'cat-lazer', // ordem 1
      'cat-mercado', // ordem 2
      'cat-transporte', // ordem 3
      'cat-aluguel', // FIXO, ordem 1
      'cat-salario', // RENDA, ordem 1
    ]);
  });

  it('VARIAVEL mais usada (por frequência de DESPESA) fica na frente, mesmo com ordem maior', () => {
    const transacoes: TransacaoParaFrequencia[] = [
      { tipo: 'DESPESA', categoriaId: 'cat-transporte' },
      { tipo: 'DESPESA', categoriaId: 'cat-transporte' },
      { tipo: 'DESPESA', categoriaId: 'cat-transporte' },
      { tipo: 'DESPESA', categoriaId: 'cat-lazer' },
    ];
    const resultado = ordenarCategoriasPorUso([MERCADO, LAZER, TRANSPORTE], transacoes);
    expect(resultado.map((c) => c.id)).toEqual(['cat-transporte', 'cat-lazer', 'cat-mercado']);
  });

  it('empate de frequência desempata por ordem', () => {
    const transacoes: TransacaoParaFrequencia[] = [
      { tipo: 'DESPESA', categoriaId: 'cat-mercado' },
      { tipo: 'DESPESA', categoriaId: 'cat-transporte' },
    ];
    const resultado = ordenarCategoriasPorUso([MERCADO, TRANSPORTE], transacoes);
    expect(resultado.map((c) => c.id)).toEqual(['cat-mercado', 'cat-transporte']);
  });

  it('categorias FIXO/RENDA nunca entram na frente, mesmo com muito mais uso registrado', () => {
    const transacoes: TransacaoParaFrequencia[] = [
      { tipo: 'DESPESA', categoriaId: 'cat-aluguel' },
      { tipo: 'DESPESA', categoriaId: 'cat-aluguel' },
    ];
    const resultado = ordenarCategoriasPorUso([MERCADO, ALUGUEL], transacoes);
    expect(resultado.map((c) => c.id)).toEqual(['cat-mercado', 'cat-aluguel']);
  });

  it('ignora ESTORNO, RENDA e TRANSFERENCIA na contagem de frequência — só DESPESA conta', () => {
    const transacoes: TransacaoParaFrequencia[] = [
      { tipo: 'ESTORNO', categoriaId: 'cat-transporte' },
      { tipo: 'RENDA', categoriaId: 'cat-transporte' },
      { tipo: 'TRANSFERENCIA', categoriaId: 'cat-transporte' },
      { tipo: 'DESPESA', categoriaId: 'cat-lazer' },
    ];
    const resultado = ordenarCategoriasPorUso([LAZER, TRANSPORTE], transacoes);
    expect(resultado.map((c) => c.id)).toEqual(['cat-lazer', 'cat-transporte']);
  });

  it('transação sem categoria (categoriaId null) não quebra a contagem', () => {
    const transacoes: TransacaoParaFrequencia[] = [
      { tipo: 'DESPESA', categoriaId: null },
      { tipo: 'DESPESA', categoriaId: 'cat-lazer' },
    ];
    const resultado = ordenarCategoriasPorUso([MERCADO, LAZER], transacoes);
    expect(resultado.map((c) => c.id)).toEqual(['cat-lazer', 'cat-mercado']);
  });

  it('lista de categorias vazia devolve lista vazia', () => {
    expect(ordenarCategoriasPorUso([], [{ tipo: 'DESPESA', categoriaId: 'x' }])).toEqual([]);
  });
});
