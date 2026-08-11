/**
 * Testes de contrato de `ConversaPort` (Fase 1 da persistência de conversas),
 * exercitados contra o fake — o mesmo padrão de `memoria.test.ts`. Não há
 * caso de uso próprio ainda (a Fase 2 conecta isto ao loop do agente); o que
 * importa provar agora é que o fake — e, por extensão, o contrato que o
 * adapter Prisma também precisa cumprir — respeita as invariantes do turno:
 * as duas mensagens nascem juntas e em ordem, a janela de contexto corta
 * pelo fim, e id desconhecido nunca devolve a transcrição de outra conversa.
 */
import { describe, expect, it } from 'vitest';
import { FakeConversaRepo } from './__fakes__/fakes-ciclo-fechamento';
import type { Proveniencia } from '@/domain/model/entidades';

const PROVENIENCIA_EXEMPLO: Proveniencia = {
  ferramentasUsadas: [
    { nome: 'estado_ciclo', argumentos: {}, comoFoiCalculado: 'tetoDoDia', falhou: false },
  ],
  valoresCitados: [{ valorFormatado: 'R$ 47,00', ferramenta: 'estado_ciclo', campo: 'tetoFormatado' }],
  valoresInformados: [],
  valoresNaoRastreados: [],
  propostas: [],
  semFerramenta: false,
  incompleta: false,
};

describe('anexarTurno', () => {
  it('grava a mensagem do usuário e a do assistente, na ordem certa', async () => {
    const repo = new FakeConversaRepo();
    const conversa = await repo.criar('Gastos de agosto');

    await repo.anexarTurno(conversa.id, {
      pergunta: 'quanto posso gastar hoje?',
      resposta: 'você tem R$ 47,00 de teto hoje.',
      proveniencia: PROVENIENCIA_EXEMPLO,
    });

    const lida = await repo.obterComMensagens(conversa.id);
    expect(lida).not.toBeNull();
    expect(lida?.mensagens).toHaveLength(2);
    expect(lida?.mensagens[0]?.papel).toBe('usuario');
    expect(lida?.mensagens[0]?.conteudo).toBe('quanto posso gastar hoje?');
    expect(lida?.mensagens[0]?.proveniencia).toBeNull();
    expect(lida?.mensagens[1]?.papel).toBe('assistente');
    expect(lida?.mensagens[1]?.conteudo).toBe('você tem R$ 47,00 de teto hoje.');
    expect(lida?.mensagens[1]?.proveniencia).toEqual(PROVENIENCIA_EXEMPLO);
  });

  it('bumpa atualizadaEm da conversa', async () => {
    const repo = new FakeConversaRepo();
    const conversa = await repo.criar('Gastos de agosto');
    const atualizadaAntes = conversa.atualizadaEm;

    await repo.anexarTurno(conversa.id, {
      pergunta: 'e amanhã?',
      resposta: 'ainda não fechou o dia de hoje.',
      proveniencia: null,
    });

    const [depois] = await repo.listar();
    expect(depois?.atualizadaEm.getTime()).toBeGreaterThanOrEqual(atualizadaAntes.getTime());
  });

  it('rejeita conversaId inexistente sem gravar nenhuma mensagem', async () => {
    const repo = new FakeConversaRepo();

    await expect(
      repo.anexarTurno('conversa-fantasma', {
        pergunta: 'oi',
        resposta: 'oi',
        proveniencia: null,
      }),
    ).rejects.toThrow();

    expect(repo.mensagens).toHaveLength(0);
  });
});

describe('ultimasMensagens', () => {
  it('respeita o limite, devolvendo as mais recentes em ordem cronológica', async () => {
    const repo = new FakeConversaRepo();
    const conversa = await repo.criar('Histórico longo');

    for (let i = 1; i <= 5; i += 1) {
      await repo.anexarTurno(conversa.id, {
        pergunta: `pergunta ${i}`,
        resposta: `resposta ${i}`,
        proveniencia: null,
      });
    }

    // 5 turnos = 10 mensagens; pedir 4 deve trazer as 4 mais recentes, na
    // ordem em que aconteceram (não invertidas) — as duas primeiras (turno 4)
    // ficam de fora da janela.
    const ultimas = await repo.ultimasMensagens(conversa.id, 4);

    expect(ultimas.map((m) => m.conteudo)).toEqual([
      'pergunta 4',
      'resposta 4',
      'pergunta 5',
      'resposta 5',
    ]);
  });

  it('devolve tudo quando o limite é maior que o histórico', async () => {
    const repo = new FakeConversaRepo();
    const conversa = await repo.criar('Conversa curta');

    await repo.anexarTurno(conversa.id, {
      pergunta: 'oi',
      resposta: 'olá',
      proveniencia: null,
    });

    const mensagens = await repo.ultimasMensagens(conversa.id, 100);
    expect(mensagens).toHaveLength(2);
    expect(mensagens[0]?.conteudo).toBe('oi');
    expect(mensagens[1]?.conteudo).toBe('olá');
  });
});

describe('obterComMensagens', () => {
  it('devolve null para um id inexistente', async () => {
    const repo = new FakeConversaRepo();
    await expect(repo.obterComMensagens('nao-existe')).resolves.toBeNull();
  });
});
