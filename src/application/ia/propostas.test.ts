/**
 * Testes do contrato de escrita por proposta (decisão D-8).
 *
 * A invariante central — "nenhuma ferramenta grava" — já é testada de graça
 * pela bateria genérica de `ferramentas.test.ts` ("%s não grava nada"), que
 * roda para TODA ferramenta do catálogo, inclusive as `propor_*`.
 *
 * O que falta e é testado aqui é o outro lado: a proposta que sai da
 * ferramenta é executável e legível, e a que sai malformada não vira botão.
 */
import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/shared/dinheiro';
import {
  CATEGORIA_VARIAVEL,
  contaFake,
  criarDeps,
} from '@/application/__fakes__/fakes-ciclo-fechamento';
import { executarFerramenta } from './ferramentas';
import { descreverProposta, propostaSchema, type PropostaExibivel } from './propostas';

const HOJE = '2026-07-20';

function deps() {
  return criarDeps({
    hoje: HOJE,
    contas: [contaFake({ id: 'c1', nome: 'Nubank' })],
  });
}

/** A proposta como ela sai da ferramenta, já no formato que o loop recolhe. */
async function propor(nome: string, argumentos: unknown): Promise<PropostaExibivel> {
  const saida = await executarFerramenta(deps(), nome, argumentos);
  expect(saida.erro, `${nome} devolveu erro: ${String(saida.erro)}`).toBeUndefined();
  return saida.proposta as PropostaExibivel;
}

describe('propor_lancamento', () => {
  it('devolve proposta executável, com nomes resolvidos para o dono conferir', async () => {
    const exibivel = await propor('propor_lancamento', {
      valorCents: 4_700,
      descricao: 'Almoço',
      data: null,
      categoriaId: CATEGORIA_VARIAVEL.id,
      contaId: 'c1',
      metodo: 'PIX',
    });

    // Executável: passa no schema que a action usa para gravar.
    expect(propostaSchema.safeParse(exibivel.proposta).success).toBe(true);

    // Legível: ninguém confirma "cat-var" — o dono precisa ver "Mercado".
    // O esperado sai de `formatBRL`, nunca de um literal: a formatação usa
    // espaço não-quebrável, e literal com espaço comum daria falso negativo.
    expect(exibivel.resumo).toBe(`Lançar ${formatBRL(4_700)} — Almoço`);
    const rotulos = Object.fromEntries(exibivel.detalhes.map((d) => [d.rotulo, d.valor]));
    expect(rotulos.Categoria).toBe('Mercado');
    expect(rotulos.Conta).toBe('Nubank');
    expect(rotulos.Valor).toBe(formatBRL(4_700));
  });

  it('marca a proposta como pendente de confirmação, para o modelo não mentir', async () => {
    const saida = await executarFerramenta(deps(), 'propor_lancamento', {
      valorCents: 4_700,
      descricao: 'Almoço',
      data: null,
      categoriaId: null,
      contaId: null,
      metodo: null,
    });

    expect(saida.precisaConfirmacao).toBe(true);
    expect(String(saida.aviso)).toMatch(/NADA foi gravado/i);
  });

  it('recusa categoria inexistente em vez de lançar sem categoria', async () => {
    const saida = await executarFerramenta(deps(), 'propor_lancamento', {
      valorCents: 4_700,
      descricao: 'Almoço',
      data: null,
      categoriaId: 'cat-que-nao-existe',
      contaId: null,
      metodo: null,
    });

    // Silenciar isso viraria um gasto sem categoria que o dono não pediu.
    expect(String(saida.erro)).toMatch(/não existe/i);
    expect(String(saida.erro)).toMatch(/opcoes_de_lancamento/);
  });

  it('recusa valor decimal — dinheiro é Int em centavos (CLAUDE.md regra 1)', async () => {
    const saida = await executarFerramenta(deps(), 'propor_lancamento', {
      valorCents: 47.5,
      descricao: 'Almoço',
      data: null,
      categoriaId: null,
      contaId: null,
      metodo: null,
    });

    expect(saida.erro).toBeDefined();
  });
});

describe('propor_memoria', () => {
  it('🔴 recusa memória com valor e diz ao modelo para reescrever sem o número', async () => {
    const saida = await executarFerramenta(deps(), 'propor_memoria', {
      tipoMemoria: 'PLANO',
      texto: 'quer juntar R$ 50.000,00 até dezembro',
    });

    expect(String(saida.erro)).toMatch(/valor em dinheiro/i);
    expect(String(saida.erro)).toMatch(/Reescreva a memória sem o número/i);
    // A recusa acontece no turno da PROPOSTA, não na confirmação: assim o
    // modelo ainda pode corrigir antes de o dono ver um botão quebrado.
    expect(saida.proposta).toBeUndefined();
  });

  it('aceita a mesma meta como intenção', async () => {
    const exibivel = await propor('propor_memoria', {
      tipoMemoria: 'PLANO',
      texto: 'quer formar uma reserva de emergência até dezembro',
    });

    expect(propostaSchema.safeParse(exibivel.proposta).success).toBe(true);
    expect(exibivel.resumo).toMatch(/memória/i);
  });
});

describe('opcoes_de_lancamento', () => {
  it('devolve ids reais e não expõe saldo de conta', async () => {
    const saida = await executarFerramenta(deps(), 'opcoes_de_lancamento', {});

    const categorias = saida.categorias as { id: string; nome: string }[];
    const contas = saida.contas as Record<string, unknown>[];

    expect(categorias.map((c) => c.id)).toContain(CATEGORIA_VARIAVEL.id);
    expect(saida.hoje).toBe(HOJE);
    // Todo campo monetário a mais é uma chance a mais de o copiloto citar um
    // número com o rótulo errado.
    for (const conta of contas) {
      expect(Object.keys(conta)).not.toContain('saldoCents');
    }
  });
});

describe('descreverProposta (função pura)', () => {
  it('usa formatBRL e nunca monta o valor à mão', () => {
    const exibivel = descreverProposta({
      tipo: 'PARCELAMENTO',
      descricao: 'Geladeira',
      valorTotalCents: 300_000,
      numParcelas: 10,
      dataCompra: null,
      categoriaId: null,
      metodo: null,
    });

    expect(exibivel.resumo).toBe(
      `Criar parcelamento de ${formatBRL(300_000)} em 10x — Geladeira`,
    );
  });

  it('diz "hoje" quando a data vem nula, em vez de inventar uma', () => {
    const exibivel = descreverProposta({
      tipo: 'LANCAMENTO',
      valorCents: 4_700,
      descricao: 'Almoço',
      data: null,
      categoriaId: null,
      contaId: null,
      metodo: null,
    });

    const rotulos = Object.fromEntries(exibivel.detalhes.map((d) => [d.rotulo, d.valor]));
    expect(rotulos.Data).toBe('hoje');
    expect(rotulos.Categoria).toBe('sem categoria');
  });
});
