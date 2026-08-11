/**
 * Testes dos casos de uso de conversa (Fase 2 do plano de persistência).
 *
 * `FakeConversaRepo` (fakes-ciclo-fechamento.ts) e `FakeProvedorIA` — nada
 * mockado no sentido de `vi.mock`: os próprios objetos de aplicação
 * (`responder`, `obterConversaDoDono`, `criarConversa`, `historicoDaConversa`,
 * `registrarTurno`) são exercitados de verdade, o que prova a integração —
 * não só que cada função isolada funciona.
 *
 * A fronteira da server action (validação de entrada, formato de retorno)
 * tem os próprios testes em `actions/ia.test.ts`, mockando esta camada.
 */
import { describe, expect, it } from 'vitest';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import { ATOR_ANONIMO } from '@/domain/auth/ator';
import { responder } from '@/application/ia/copiloto';
import { FakeProvedorIA } from '@/application/__fakes__/fake-provedor-ia';
import { criarDeps, ATOR_OWNER, ATOR_VIEWER, type FakeDeps } from '@/application/__fakes__/fakes-ciclo-fechamento';
import {
  abrirConversa,
  criarConversa,
  excluirConversa,
  historicoDaConversa,
  listarConversas,
  obterConversaDoDono,
  registrarTurno,
  renomearConversa,
  ConversaNaoEncontradaError,
} from './conversas';

/** Deps com o fake de IA plugado — o único jeito de `responder()` funcionar. */
function depsCom(ia: FakeProvedorIA, ator = ATOR_OWNER): FakeDeps {
  return { ...criarDeps({ ator }), ia };
}

describe('obterConversaDoDono / criarConversa — fluxo de perguntarCopiloto', () => {
  it('conversaId null: responder() com sucesso, depois criarConversa grava o turno', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'Você pode gastar R$ 80,00 hoje.' }]);
    const deps = depsCom(ia);

    const resposta = await responder(deps, { pergunta: 'quanto posso gastar hoje?' });
    const conversa = await criarConversa(deps, 'quanto posso gastar hoje?');
    await registrarTurno(deps, conversa.id, {
      pergunta: 'quanto posso gastar hoje?',
      resposta: resposta.texto,
      proveniencia: null,
    });

    expect(conversa.titulo).toBe('quanto posso gastar hoje?');
    const gravada = await deps.conversas.obterComMensagens(conversa.id);
    expect(gravada?.mensagens.map((m) => m.conteudo)).toEqual([
      'quanto posso gastar hoje?',
      'Você pode gastar R$ 80,00 hoje.',
    ]);
  });

  it('conversaId existente: obterConversaDoDono nunca cria uma conversa nova', async () => {
    const deps = criarDeps({ ator: ATOR_OWNER });
    const original = await deps.conversas.criar('primeira pergunta');

    const encontrada = await obterConversaDoDono(deps, original.id);

    expect(encontrada.id).toBe(original.id);
    expect(deps.conversas.conversas).toHaveLength(1);
  });

  it('obterConversaDoDono lança para id inexistente — sem gastar turno de IA', async () => {
    const deps = criarDeps({ ator: ATOR_OWNER });

    await expect(obterConversaDoDono(deps, 'conversa-fantasma')).rejects.toBeInstanceOf(
      ConversaNaoEncontradaError,
    );
  });

  it('falha do responder() não deixa nada gravado quando a conversa é nova', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'ERRO', motivo: 'INDISPONIVEL' }]);
    const deps = depsCom(ia);

    await expect(responder(deps, { pergunta: 'oi' })).rejects.toThrow();

    // `criarConversa`/`registrarTurno` nunca chegam a ser chamados pelo
    // caminho real (ver `actions/ia.ts`): nada existe no fake.
    expect(deps.conversas.conversas).toHaveLength(0);
    expect(deps.conversas.mensagens).toHaveLength(0);
  });
});

describe('historicoDaConversa — janela respeita o limite', () => {
  it('devolve só as N mensagens mais recentes, em ordem cronológica', async () => {
    const deps = criarDeps({ ator: ATOR_OWNER });
    const conversa = await deps.conversas.criar('conversa longa');

    for (let i = 1; i <= 5; i += 1) {
      await deps.conversas.anexarTurno(conversa.id, {
        pergunta: `pergunta ${i}`,
        resposta: `resposta ${i}`,
        proveniencia: null,
      });
    }
    // 5 turnos = 10 mensagens no banco; a janela pede só as 2 mais recentes
    // (o próprio último turno).

    const historico = await historicoDaConversa(deps, conversa.id, 2);

    expect(historico).toEqual([
      { papel: 'usuario', conteudo: 'pergunta 5' },
      { papel: 'assistente', conteudo: 'resposta 5' },
    ]);
  });

  it('histórico menor que o limite passa inteiro', async () => {
    const deps = criarDeps({ ator: ATOR_OWNER });
    const conversa = await deps.conversas.criar('conversa curta');
    await deps.conversas.anexarTurno(conversa.id, {
      pergunta: 'oi',
      resposta: 'olá',
      proveniencia: null,
    });

    const historico = await historicoDaConversa(deps, conversa.id, 20);

    expect(historico).toEqual([
      { papel: 'usuario', conteudo: 'oi' },
      { papel: 'assistente', conteudo: 'olá' },
    ]);
  });
});

const CASOS_DE_USO: ReadonlyArray<readonly [string, (d: FakeDeps) => Promise<unknown>]> = [
  ['listarConversas', (d) => listarConversas(d)],
  ['abrirConversa', (d) => abrirConversa(d, 'qualquer-id')],
  ['renomearConversa', (d) => renomearConversa(d, 'qualquer-id', 'novo título')],
  ['excluirConversa', (d) => excluirConversa(d, 'qualquer-id')],
  ['obterConversaDoDono', (d) => obterConversaDoDono(d, 'qualquer-id')],
  ['criarConversa', (d) => criarConversa(d, 'pergunta qualquer')],
  ['historicoDaConversa', (d) => historicoDaConversa(d, 'qualquer-id', 20)],
  [
    'registrarTurno',
    (d) => registrarTurno(d, 'qualquer-id', { pergunta: 'p', resposta: 'r', proveniencia: null }),
  ],
];

describe.each(CASOS_DE_USO)('%s — VIEWER é barrado', (_nome, executar) => {
  it('lança AcessoNegadoError para VIEWER', async () => {
    const deps = criarDeps({ ator: ATOR_VIEWER });
    await expect(executar(deps)).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('lança AcessoNegadoError para o ator anônimo', async () => {
    const deps = criarDeps({ ator: ATOR_ANONIMO });
    await expect(executar(deps)).rejects.toBeInstanceOf(AcessoNegadoError);
  });
});
