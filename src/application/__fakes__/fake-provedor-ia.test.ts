/**
 * Fumaça do `FakeProvedorIA`: prova que ele satisfaz a porta e que os turnos
 * saem na ordem programada. Sem isso, todo teste do copiloto (D6) estaria
 * apoiado num fake não verificado.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErroProvedorIA, type DefinicaoFerramenta, type ProvedorIAPort } from '@/domain/ports/ia';
import { FakeProvedorIA } from './fake-provedor-ia';

const FERRAMENTAS: DefinicaoFerramenta[] = [
  {
    nome: 'situacao_hoje',
    descricao: 'Teto de hoje e quanto resta.',
    argumentos: z.object({}),
  },
  {
    nome: 'projetar_ciclos',
    descricao: 'Projeta N ciclos à frente.',
    argumentos: z.object({ numCiclos: z.number().int() }),
  },
];

function perguntar(provedor: ProvedorIAPort, texto: string) {
  return provedor.completarComTools({
    mensagens: [{ papel: 'usuario', conteudo: texto }],
    ferramentas: FERRAMENTAS,
  });
}

describe('FakeProvedorIA', () => {
  it('satisfaz ProvedorIAPort e devolve o texto programado', async () => {
    const provedor: ProvedorIAPort = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'pronto' }]);

    const { resposta } = await perguntar(provedor, 'oi');

    expect(resposta).toEqual({ tipo: 'TEXTO', texto: 'pronto' });
  });

  it('entrega os turnos na ordem programada: ferramenta, ferramenta, texto', async () => {
    const provedor = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'situacao_hoje', argumentos: {} }] },
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'projetar_ciclos', argumentos: { numCiclos: 3 } }] },
      { tipo: 'TEXTO', texto: 'resposta final' },
    ]);

    const primeiro = await perguntar(provedor, 'e aí?');
    const segundo = await perguntar(provedor, 'e aí?');
    const terceiro = await perguntar(provedor, 'e aí?');

    expect(primeiro.resposta.tipo).toBe('FERRAMENTAS');
    expect(primeiro.resposta.tipo === 'FERRAMENTAS' && primeiro.resposta.chamadas[0]?.nome).toBe(
      'situacao_hoje',
    );
    expect(segundo.resposta.tipo === 'FERRAMENTAS' && segundo.resposta.chamadas[0]?.argumentos).toEqual({
      numCiclos: 3,
    });
    expect(terceiro.resposta).toEqual({ tipo: 'TEXTO', texto: 'resposta final' });
    expect(provedor.turnosRestantes).toBe(0);
  });

  it('gera id de chamada quando omitido, e respeita o id informado', async () => {
    const provedor = new FakeProvedorIA([
      {
        tipo: 'FERRAMENTAS',
        chamadas: [
          { nome: 'situacao_hoje', argumentos: {} },
          { nome: 'projetar_ciclos', argumentos: { numCiclos: 1 }, id: 'fixo-1' },
        ],
      },
    ]);

    const { resposta } = await perguntar(provedor, 'oi');

    if (resposta.tipo !== 'FERRAMENTAS') throw new Error('esperava chamadas de ferramenta');
    expect(resposta.chamadas[0]?.id).toBeTruthy();
    expect(resposta.chamadas[1]?.id).toBe('fixo-1');
  });

  it('registra mensagens e ferramentas de cada chamada recebida', async () => {
    const provedor = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'ok' }]);

    await provedor.completarComTools({
      mensagens: [
        { papel: 'sistema', conteudo: 'seja honesto' },
        { papel: 'usuario', conteudo: 'quanto posso gastar?' },
        { papel: 'ferramenta', idChamada: 'c1', nome: 'situacao_hoje', conteudo: '{"tetoHojeCents":1000}' },
      ],
      ferramentas: FERRAMENTAS,
    });

    expect(provedor.chamadas).toHaveLength(1);
    expect(provedor.chamadas[0]?.mensagens).toHaveLength(3);
    expect(provedor.chamadas[0]?.ferramentas.map((f) => f.nome)).toEqual([
      'situacao_hoje',
      'projetar_ciclos',
    ]);
    expect(provedor.ferramentasPedidas()).toEqual(['situacao_hoje']);
  });

  it('programa falha do provedor com motivo tipado', async () => {
    const provedor = new FakeProvedorIA([{ tipo: 'ERRO', motivo: 'INDISPONIVEL' }]);

    await expect(perguntar(provedor, 'oi')).rejects.toBeInstanceOf(ErroProvedorIA);
  });

  it('programa argumento fora do schema como SCHEMA_INVALIDO', async () => {
    const provedor = new FakeProvedorIA([
      { tipo: 'ERRO', motivo: 'SCHEMA_INVALIDO', mensagem: 'numCiclos veio decimal' },
    ]);

    await expect(perguntar(provedor, 'projete 3 ciclos')).rejects.toMatchObject({
      motivo: 'SCHEMA_INVALIDO',
      message: 'numCiclos veio decimal',
    });
  });

  it('programa o modelo pedindo ferramenta inexistente — o fake não filtra', async () => {
    const provedor = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'ferramenta_que_nao_existe', argumentos: {} }] },
    ]);

    const { resposta } = await perguntar(provedor, 'faz mágica');

    if (resposta.tipo !== 'FERRAMENTAS') throw new Error('esperava chamadas de ferramenta');
    expect(resposta.chamadas[0]?.nome).toBe('ferramenta_que_nao_existe');
    expect(FERRAMENTAS.some((f) => f.nome === 'ferramenta_que_nao_existe')).toBe(false);
  });

  it('reporta consumo de tokens quando programado', async () => {
    const provedor = new FakeProvedorIA([
      { tipo: 'TEXTO', texto: 'ok', consumo: { entrada: 1200, saida: 80 } },
    ]);

    const { consumo } = await perguntar(provedor, 'oi');

    expect(consumo).toEqual({ entrada: 1200, saida: 80 });
  });

  it('falha com erro explícito quando a fila acaba', async () => {
    const provedor = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'ok' }]);
    await perguntar(provedor, 'oi');

    await expect(perguntar(provedor, 'de novo')).rejects.toThrow(/fila vazia/);
  });
});
