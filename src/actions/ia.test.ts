/**
 * Testes da server action do copiloto (Fase 2 — histórico por conversa).
 *
 * `criarDeps`, o loop do agente e os casos de uso de conversa são mockados: o
 * que está sob teste aqui é a FRONTEIRA — validação de entrada, a ordem
 * resolve/valida-conversa → responde → persiste, e a garantia de que nenhuma
 * exceção vaza para a UI (SPEC 8). A lógica de `obterConversaDoDono` /
 * `criarConversa` / `historicoDaConversa` / `registrarTurno` tem os próprios
 * testes em `application/ia/conversas.test.ts` (com `FakeConversaRepo` de
 * verdade).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RespostaCopiloto } from '@/application/ia/copiloto';
import type { Conversa } from '@/domain/model/entidades';

const responderMock = vi.fn();
const obterConversaDoDonoMock = vi.fn();
const criarConversaMock = vi.fn();
const historicoDaConversaMock = vi.fn();
const registrarTurnoMock = vi.fn();

vi.mock('@/composition', () => ({
  criarDeps: vi.fn(async () => ({ marcador: 'deps-fake' })),
}));

vi.mock('@/application/ia/copiloto', () => ({
  responder: (...args: unknown[]) => responderMock(...args),
}));

vi.mock('@/application/ia/conversas', () => ({
  obterConversaDoDono: (...args: unknown[]) => obterConversaDoDonoMock(...args),
  criarConversa: (...args: unknown[]) => criarConversaMock(...args),
  historicoDaConversa: (...args: unknown[]) => historicoDaConversaMock(...args),
  registrarTurno: (...args: unknown[]) => registrarTurnoMock(...args),
  listarConversas: vi.fn(),
  abrirConversa: vi.fn(),
  renomearConversa: vi.fn(),
  excluirConversa: vi.fn(),
}));

const { perguntarCopiloto, confirmarProposta } = await import('./ia');

const RESPOSTA: RespostaCopiloto = {
  texto: 'ok',
  ferramentasUsadas: [],
  propostas: [],
  valoresCitados: [],
  valoresInformados: [],
  valoresNaoRastreados: [],
  semFerramenta: true,
  incompleta: false,
  turnosUsados: 1,
  consumo: { entrada: 0, saida: 0 },
};

const CONVERSA_NOVA: Conversa = {
  id: 'conversa-1',
  titulo: 'quanto posso gastar hoje?',
  criadaEm: new Date('2026-08-11T12:00:00Z'),
  atualizadaEm: new Date('2026-08-11T12:00:00Z'),
};

const CONVERSA_EXISTENTE: Conversa = {
  id: 'conversa-existente',
  titulo: 'primeira pergunta',
  criadaEm: new Date('2026-08-10T12:00:00Z'),
  atualizadaEm: new Date('2026-08-10T12:00:00Z'),
};

/** Argumentos da última chamada ao loop. */
function ultimaChamadaAoLoop(): { pergunta: string; historico: unknown[] } {
  const chamada = responderMock.mock.calls.at(-1);
  if (!chamada) throw new Error('responder não foi chamado');
  return chamada[1] as { pergunta: string; historico: unknown[] };
}

beforeEach(() => {
  responderMock.mockReset();
  obterConversaDoDonoMock.mockReset();
  criarConversaMock.mockReset();
  historicoDaConversaMock.mockReset();
  registrarTurnoMock.mockReset();

  responderMock.mockResolvedValue(RESPOSTA);
  obterConversaDoDonoMock.mockResolvedValue(CONVERSA_EXISTENTE);
  criarConversaMock.mockResolvedValue(CONVERSA_NOVA);
  historicoDaConversaMock.mockResolvedValue([]);
  registrarTurnoMock.mockResolvedValue(undefined);
});

describe('perguntarCopiloto — conversaId null (conversa nova)', () => {
  it('não carrega histórico nem cria a conversa antes de chamar o modelo', async () => {
    await perguntarCopiloto({ conversaId: null, pergunta: 'quanto posso gastar hoje?' });

    expect(historicoDaConversaMock).not.toHaveBeenCalled();
    expect(ultimaChamadaAoLoop()).toEqual({ pergunta: 'quanto posso gastar hoje?', historico: [] });
  });

  it('cria a conversa e persiste o turno só depois da resposta do modelo', async () => {
    const resultado = await perguntarCopiloto({ conversaId: null, pergunta: 'oi' });

    expect(criarConversaMock).toHaveBeenCalledWith(expect.anything(), 'oi');
    expect(registrarTurnoMock).toHaveBeenCalledWith(expect.anything(), 'conversa-1', {
      pergunta: 'oi',
      resposta: 'ok',
      // RESPOSTA não tem ferramenta, valor citado, valor não rastreado,
      // proposta nem loop incompleto — nada para a UI reconstruir depois.
      proveniencia: null,
    });
    expect(resultado).toEqual({ ok: true, data: { conversaId: 'conversa-1', resposta: RESPOSTA } });
  });

  it('remove espaço em volta da pergunta antes de mandar ao modelo e de nomear a conversa', async () => {
    await perguntarCopiloto({ conversaId: null, pergunta: '   e o patrimônio?   ' });

    expect(ultimaChamadaAoLoop().pergunta).toBe('e o patrimônio?');
    expect(criarConversaMock).toHaveBeenCalledWith(expect.anything(), 'e o patrimônio?');
  });

  it('falha do modelo não cria conversa nem grava turno — nada de órfão no banco', async () => {
    responderMock.mockRejectedValue(new Error('Provedor de IA indisponível: timeout'));

    const resultado = await perguntarCopiloto({ conversaId: null, pergunta: 'oi' });

    expect(resultado).toEqual({ ok: false, erro: 'Provedor de IA indisponível: timeout' });
    expect(criarConversaMock).not.toHaveBeenCalled();
    expect(registrarTurnoMock).not.toHaveBeenCalled();
  });
});

describe('perguntarCopiloto — conversaId preenchido', () => {
  it('valida o dono da conversa ANTES de chamar o modelo', async () => {
    obterConversaDoDonoMock.mockRejectedValue(new Error('Conversa conversa-x não encontrada.'));

    const resultado = await perguntarCopiloto({ conversaId: 'conversa-x', pergunta: 'oi' });

    expect(resultado).toEqual({ ok: false, erro: 'Conversa conversa-x não encontrada.' });
    expect(responderMock).not.toHaveBeenCalled();
    expect(registrarTurnoMock).not.toHaveBeenCalled();
  });

  it('carrega o histórico da conversa validada e nunca cria uma nova', async () => {
    const resultado = await perguntarCopiloto({ conversaId: 'conversa-existente', pergunta: 'e agora?' });

    expect(obterConversaDoDonoMock).toHaveBeenCalledWith(expect.anything(), 'conversa-existente');
    expect(historicoDaConversaMock).toHaveBeenCalledWith(expect.anything(), 'conversa-existente', 20);
    expect(criarConversaMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({
      ok: true,
      data: { conversaId: 'conversa-existente', resposta: RESPOSTA },
    });
  });

  it('falha do modelo não grava turno na conversa existente', async () => {
    responderMock.mockRejectedValue(new Error('timeout'));

    await perguntarCopiloto({ conversaId: 'conversa-existente', pergunta: 'e agora?' });

    expect(registrarTurnoMock).not.toHaveBeenCalled();
  });
});

describe('validação de entrada', () => {
  it('pergunta vazia vira erro legível, não exceção', async () => {
    const resultado = await perguntarCopiloto({ conversaId: null, pergunta: '   ' });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.erro).toMatch(/escreva uma pergunta/i);
    expect(responderMock).not.toHaveBeenCalled();
  });

  it('pergunta longa demais é recusada antes de qualquer I/O', async () => {
    const resultado = await perguntarCopiloto({ conversaId: null, pergunta: 'a'.repeat(1001) });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.erro).toMatch(/longa demais/i);
    expect(responderMock).not.toHaveBeenCalled();
    expect(criarConversaMock).not.toHaveBeenCalled();
  });

  it('conversaId vazio (string) é recusado — só null vale como "conversa nova"', async () => {
    const resultado = await perguntarCopiloto({ conversaId: '', pergunta: 'oi' });

    expect(resultado.ok).toBe(false);
    expect(obterConversaDoDonoMock).not.toHaveBeenCalled();
    expect(criarConversaMock).not.toHaveBeenCalled();
  });
});

describe('confirmarProposta — proposta IMPORTACAO', () => {
  it('recusa gravar em bloco — a confirmação da importação é por linha (D-18 revista, §15.7)', async () => {
    const resultado = await confirmarProposta({
      tipo: 'IMPORTACAO',
      importacaoId: 'importacao-1',
      competenciaRef: '2026-07',
      totalGeralCents: 1_200,
      itens: [
        {
          itemId: 'item-1',
          ordem: 1,
          faixa: 'NOVO',
          descricao: 'Padaria do Zé',
          data: '2026-07-11',
          valorCents: 1_200,
          vereditoMotivo: null,
        },
      ],
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.erro).toMatch(/não é confirmada em bloco|por linha/i);
  });
});

describe('nenhuma exceção vaza para a UI (SPEC 8)', () => {
  it('camada de IA desligada vira Resultado com erro legível', async () => {
    responderMock.mockRejectedValue(
      new Error('A camada de IA está desligada. Preencha OPENAI_API_KEY e IA_HABILITADA=true no .env.'),
    );

    const resultado = await perguntarCopiloto({ conversaId: null, pergunta: 'oi' });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.erro).toMatch(/camada de IA está desligada/i);
  });
});
