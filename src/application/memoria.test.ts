/**
 * Testes dos casos de uso da memória (Fase E, tarefa E5).
 *
 * As três invariantes que estes testes protegem, na ordem em que doem se
 * quebrarem:
 *
 *  1. número nunca chega ao banco nem ao provedor de embedding;
 *  2. memória é OWNER-only, inclusive na LEITURA (decisão D-12);
 *  3. embedding gasta dinheiro, então respeita o teto diário — e falhar nele
 *     degrada a busca, nunca perde a memória.
 */
import { describe, expect, it } from 'vitest';
import {
  FakeEmbedding,
  criarDeps,
  type FakeDeps,
} from './__fakes__/fakes-ciclo-fechamento';
import { ATOR_ANONIMO } from '@/domain/auth/ator';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import {
  MemoriaInvalidaError,
  arquivarMemoria,
  buscarMemoria,
  listarMemorias,
  reindexarMemorias,
  salvarMemoria,
} from './memoria';

import type { Ator } from '@/domain/auth/ator';

const ATOR_VIEWER: Ator = { id: 'u-viewer', papel: 'VIEWER' };

function deps(opcoes: Parameters<typeof criarDeps>[0] = {}): FakeDeps {
  return criarDeps({ embeddings: new FakeEmbedding(), ...opcoes });
}

describe('salvarMemoria', () => {
  it('grava a intenção e vetoriza o texto normalizado', async () => {
    const d = deps();
    const embeddings = d.embeddings as FakeEmbedding;

    const memoria = await salvarMemoria(d, {
      tipo: 'PLANO',
      texto: '  quero  sair do aluguel até 2028 ',
    });

    expect(memoria.texto).toBe('quero sair do aluguel até 2028');
    expect(memoria.origem).toBe('USUARIO');
    // Vetoriza o texto JÁ normalizado — vetorizar o bruto guardaria um vetor
    // que não corresponde ao que está gravado.
    expect(embeddings.chamadas).toEqual(['quero sair do aluguel até 2028']);
    expect(d.memorias.itens[0]?.embedding).toHaveLength(embeddings.dimensoes);
  });

  it('🔴 recusa texto com valor monetário ANTES de gastar embedding', async () => {
    const d = deps();
    const embeddings = d.embeddings as FakeEmbedding;

    await expect(
      salvarMemoria(d, { tipo: 'PLANO', texto: 'quero juntar R$ 50.000,00' }),
    ).rejects.toBeInstanceOf(MemoriaInvalidaError);

    // O ponto do teste: nada foi gravado E nada foi pago.
    expect(d.memorias.itens).toHaveLength(0);
    expect(embeddings.chamadas).toHaveLength(0);
    expect(d.usoIA.incrementos).toHaveLength(0);
  });

  it('registra o consumo do embedding no teto diário', async () => {
    const d = deps();

    await salvarMemoria(d, { tipo: 'PLANO', texto: 'quer trocar de carro em 2027' });

    expect(d.usoIA.incrementos).toHaveLength(1);
    expect(d.usoIA.incrementos[0]?.uso.requisicoes).toBe(1);
    expect(d.usoIA.incrementos[0]?.uso.tokensEntrada).toBeGreaterThan(0);
  });

  it('grava sem vetor quando o teto diário já estourou', async () => {
    const d = deps({ usoIA: { requisicoes: 50, tokensEntrada: 0, tokensSaida: 0 } });
    const embeddings = d.embeddings as FakeEmbedding;

    const memoria = await salvarMemoria(d, { tipo: 'PLANO', texto: 'quer sair do aluguel' });

    // Teto impede GASTAR, não impede GUARDAR: perder a memória do dono seria
    // pior que perder a busca semântica sobre ela.
    expect(memoria.id).toBeTruthy();
    expect(embeddings.chamadas).toHaveLength(0);
    expect(d.memorias.itens[0]?.embedding).toBeNull();
  });

  it('grava sem vetor quando o provedor de embedding falha', async () => {
    const d = deps();
    (d.embeddings as FakeEmbedding).falhar = true;

    const memoria = await salvarMemoria(d, { tipo: 'CONTEXTO', texto: 'trabalha como dev' });

    expect(memoria.texto).toBe('trabalha como dev');
    expect(d.memorias.itens[0]?.embedding).toBeNull();
  });

  it('funciona sem provedor de embedding configurado', async () => {
    const d = criarDeps(); // sem `embeddings`

    const memoria = await salvarMemoria(d, { tipo: 'PREFERENCIA', texto: 'evita parcelar compras' });

    expect(memoria.id).toBeTruthy();
    expect(d.usoIA.incrementos).toHaveLength(0);
  });

  it('marca origem COPILOTO quando a proposta foi confirmada', async () => {
    const d = deps();

    const memoria = await salvarMemoria(d, {
      tipo: 'PLANO',
      texto: 'quer sair do aluguel',
      origem: 'COPILOTO',
    });

    expect(memoria.origem).toBe('COPILOTO');
  });
});

describe('memória é OWNER-only (decisão D-12)', () => {
  it('VIEWER não escreve', async () => {
    const d = deps({ ator: ATOR_VIEWER });

    await expect(salvarMemoria(d, { tipo: 'PLANO', texto: 'quer sair do aluguel' })).rejects.toBeInstanceOf(
      AcessoNegadoError,
    );
  });

  it('🔴 VIEWER também não LÊ — memória é mais sensível que os números', async () => {
    const d = deps({ ator: ATOR_VIEWER });

    await expect(listarMemorias(d)).rejects.toBeInstanceOf(AcessoNegadoError);
    await expect(buscarMemoria(d, 'planos')).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('anônimo não lê nem escreve', async () => {
    const d = deps({ ator: ATOR_ANONIMO });

    await expect(listarMemorias(d)).rejects.toBeInstanceOf(AcessoNegadoError);
    await expect(arquivarMemoria(d, 'mem-1')).rejects.toBeInstanceOf(AcessoNegadoError);
  });
});

describe('buscarMemoria', () => {
  it('devolve as mais próximas do vetor da consulta', async () => {
    const d = deps();
    await salvarMemoria(d, { tipo: 'PLANO', texto: 'quer sair do aluguel até 2028' });
    await salvarMemoria(d, { tipo: 'CONTEXTO', texto: 'tem dois filhos pequenos' });

    const achadas = await buscarMemoria(d, 'quer sair do aluguel até 2028');

    expect(achadas[0]?.texto).toBe('quer sair do aluguel até 2028');
    expect(achadas[0]?.distancia).toBe(0);
  });

  it('degrada para as mais recentes quando não há embedding, e sinaliza isso', async () => {
    const d = criarDeps(); // sem `embeddings`
    await salvarMemoria(d, { tipo: 'PLANO', texto: 'quer sair do aluguel' });

    const achadas = await buscarMemoria(d, 'qualquer coisa');

    expect(achadas).toHaveLength(1);
    // NaN é a forma honesta de dizer "não houve comparação vetorial aqui" —
    // devolver 0 faria recência passar por relevância perfeita.
    expect(Number.isNaN(achadas[0]?.distancia)).toBe(true);
  });
});

describe('arquivarMemoria', () => {
  it('some da listagem e da busca, mas continua existindo', async () => {
    const d = deps();
    const memoria = await salvarMemoria(d, { tipo: 'PLANO', texto: 'quer sair do aluguel' });

    await arquivarMemoria(d, memoria.id);

    expect(await listarMemorias(d)).toHaveLength(0);
    expect(await listarMemorias(d, { incluirArquivadas: true })).toHaveLength(1);
  });
});

/**
 * Reindexação (fecha o ciclo da E8): o backup não carrega os vetores, então
 * sem isto uma restauração deixaria a busca semântica cega para sempre.
 */
describe('reindexarMemorias', () => {
  it('vetoriza as memórias que estão sem vetor', async () => {
    const d = deps();
    // Simula memórias restauradas de backup: existem, sem embedding.
    await d.memorias.criar({ tipo: 'PLANO', texto: 'quer sair do aluguel', origem: 'USUARIO', embedding: null });
    await d.memorias.criar({ tipo: 'CONTEXTO', texto: 'trabalha como dev', origem: 'USUARIO', embedding: null });

    const resultado = await reindexarMemorias(d);

    expect(resultado).toEqual({ reindexadas: 2, restantes: 0 });
    expect(d.memorias.itens.every((m) => m.embedding !== null)).toBe(true);
  });

  it('não regrava quem já tem vetor', async () => {
    const d = deps();
    await salvarMemoria(d, { tipo: 'PLANO', texto: 'quer sair do aluguel' });
    const embeddings = d.embeddings as FakeEmbedding;
    embeddings.chamadas = [];

    const resultado = await reindexarMemorias(d);

    expect(resultado.reindexadas).toBe(0);
    expect(embeddings.chamadas).toHaveLength(0);
  });

  it('para no teto diário e reporta o que ficou pendente', async () => {
    const d = deps({ usoIA: { requisicoes: 50, tokensEntrada: 0, tokensSaida: 0 } });
    await d.memorias.criar({ tipo: 'PLANO', texto: 'quer sair do aluguel', origem: 'USUARIO', embedding: null });
    await d.memorias.criar({ tipo: 'CONTEXTO', texto: 'trabalha como dev', origem: 'USUARIO', embedding: null });

    const resultado = await reindexarMemorias(d);

    // Para na primeira em vez de queimar a fila tentando: o critério é "ainda
    // está sem vetor", então rodar amanhã continua de onde parou.
    expect(resultado).toEqual({ reindexadas: 0, restantes: 2 });
  });

  it('é OWNER-only como o resto da memória', async () => {
    await expect(reindexarMemorias(deps({ ator: ATOR_VIEWER }))).rejects.toBeInstanceOf(
      AcessoNegadoError,
    );
  });
});
