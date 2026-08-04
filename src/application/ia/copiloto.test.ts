/**
 * Testes do loop do agente (D3) e auditoria do prompt de sistema.
 *
 * Tudo com `FakeProvedorIA`: determinístico, sem rede, sem custo.
 *
 * O teste mais importante deste arquivo é o da auditoria do prompt: ele varre
 * o texto procurando fórmula. Regra de cálculo migrando para o prompt é o
 * risco nº 2 do plano, e é o único que NÃO aparece em nenhum outro teste,
 * porque prompt não é código — se ninguém olhar, ninguém vê.
 */
import { describe, expect, it } from 'vitest';
import { ErroProvedorIA, type MensagemIA } from '@/domain/ports/ia';
import { FakeProvedorIA } from '@/application/__fakes__/fake-provedor-ia';
import {
  criarDeps,
  cicloFake,
  transacaoFake,
  type FakeDeps,
} from '@/application/__fakes__/fakes-ciclo-fechamento';
import { executarFerramenta } from './ferramentas';
import { CopilotoIndisponivelError, MAX_TURNOS, responder } from './copiloto';
import { MENSAGEM_LIMITE_DE_TURNOS, PROMPT_SISTEMA } from './prompt-sistema';

const HOJE = '2026-07-20';

function depsCom(ia: FakeProvedorIA): FakeDeps {
  return {
    ...criarDeps({
      hoje: HOJE,
      ciclos: [cicloFake({ id: 'ciclo-atual', dataInicio: '2026-07-05', dataFim: '2026-08-04' })],
      transacoes: [
        transacaoFake({ id: 't1', data: '2026-07-10', valorCents: 12_000, cicloId: 'ciclo-atual' }),
        transacaoFake({
          id: 'p1',
          data: '2026-07-25',
          valorCents: 50_000,
          cicloId: 'ciclo-atual',
          parcelamentoId: 'pc-1',
        }),
      ],
    }),
    ia,
  };
}

describe('responder — loop de tool calling', () => {
  it('executa a ferramenta pedida e devolve o texto final', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'situacao_hoje', argumentos: {} }] },
      { tipo: 'TEXTO', texto: 'Hoje você ainda pode gastar bastante.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'quanto posso gastar hoje?' });

    expect(resposta.texto).toBe('Hoje você ainda pode gastar bastante.');
    expect(resposta.ferramentasUsadas.map((f) => f.nome)).toEqual(['situacao_hoje']);
    expect(resposta.ferramentasUsadas[0]?.comoFoiCalculado).toBe(
      'domain/finance/teto.ts: calcularTeto',
    );
    expect(resposta.incompleta).toBe(false);
    expect(resposta.semFerramenta).toBe(false);
    expect(resposta.turnosUsados).toBe(2);
  });

  it('chama simular_compra_parcelada com os argumentos que o modelo pediu', async () => {
    const ia = new FakeProvedorIA([
      {
        tipo: 'FERRAMENTAS',
        chamadas: [
          {
            nome: 'simular_compra_parcelada',
            argumentos: {
              descricao: 'Notebook',
              valorTotalCents: 300_000,
              numParcelas: 10,
              dataCompra: '2026-08-10',
              numCiclos: 12,
            },
          },
        ],
      },
      { tipo: 'TEXTO', texto: 'Dá, mas aperta.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'posso parcelar 3000 em 10x?' });

    expect(resposta.ferramentasUsadas[0]?.nome).toBe('simular_compra_parcelada');
    expect(resposta.ferramentasUsadas[0]?.argumentos).toMatchObject({
      valorTotalCents: 300_000,
      numParcelas: 10,
    });
    expect(resposta.ferramentasUsadas[0]?.falhou).toBe(false);
  });

  it('encadeia várias ferramentas em turnos diferentes', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'situacao_hoje', argumentos: {} }] },
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'estado_ciclo', argumentos: {} }] },
      { tipo: 'TEXTO', texto: 'Pronto.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'como estou?' });

    expect(resposta.ferramentasUsadas.map((f) => f.nome)).toEqual(['situacao_hoje', 'estado_ciclo']);
    expect(resposta.turnosUsados).toBe(3);
  });

  it('executa duas ferramentas pedidas no mesmo turno', async () => {
    const ia = new FakeProvedorIA([
      {
        tipo: 'FERRAMENTAS',
        chamadas: [
          { nome: 'situacao_hoje', argumentos: {} },
          { nome: 'patrimonio_resumo', argumentos: {} },
        ],
      },
      { tipo: 'TEXTO', texto: 'Ok.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'resumo geral' });

    expect(resposta.ferramentasUsadas).toHaveLength(2);
  });

  it('corta no limite de turnos e responde honestamente, sem palpite', async () => {
    const ia = new FakeProvedorIA(
      Array.from({ length: MAX_TURNOS + 3 }, () => ({
        tipo: 'FERRAMENTAS' as const,
        chamadas: [{ nome: 'situacao_hoje', argumentos: {} }],
      })),
    );

    const resposta = await responder(depsCom(ia), { pergunta: 'me enrola' });

    expect(resposta.incompleta).toBe(true);
    expect(resposta.texto).toBe(MENSAGEM_LIMITE_DE_TURNOS);
    expect(resposta.turnosUsados).toBe(MAX_TURNOS);
    expect(resposta.valoresNaoRastreados).toEqual([]);
    expect(ia.chamadas).toHaveLength(MAX_TURNOS);
  });

  it('ferramenta inexistente pedida pelo modelo não quebra o loop', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'inventar_dinheiro', argumentos: {} }] },
      { tipo: 'TEXTO', texto: 'Não tenho essa informação.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'invente algo' });

    expect(resposta.texto).toBe('Não tenho essa informação.');
    expect(resposta.ferramentasUsadas[0]?.falhou).toBe(true);
  });

  it('argumento fora do schema vira erro de ferramenta, não exceção', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'projetar_ciclos', argumentos: { numCiclos: 3.7 } }] },
      { tipo: 'TEXTO', texto: 'Não consegui projetar.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'projete' });

    expect(resposta.ferramentasUsadas[0]?.falhou).toBe(true);
    expect(resposta.texto).toBe('Não consegui projetar.');
  });

  it('erro do provedor propaga tipado', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'ERRO', motivo: 'LIMITE_EXCEDIDO' }]);

    await expect(responder(depsCom(ia), { pergunta: 'oi' })).rejects.toBeInstanceOf(ErroProvedorIA);
  });

  it('sem deps.ia, erro legível', async () => {
    const deps = criarDeps({ hoje: HOJE });

    await expect(responder(deps, { pergunta: 'oi' })).rejects.toBeInstanceOf(
      CopilotoIndisponivelError,
    );
  });
});

describe('proveniência dos valores', () => {
  it('marca como citado o valor formatado que veio de ferramenta', async () => {
    // Descobre um valor real que a ferramenta devolve, e faz o modelo citá-lo.
    const saida = await executarFerramenta(depsCom(new FakeProvedorIA()), 'estado_ciclo', {});
    const verbaLivre = saida.verbaLivreFormatado as string;

    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'estado_ciclo', argumentos: {} }] },
      { tipo: 'TEXTO', texto: `Sua verba livre é ${verbaLivre}.` },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'verba?' });

    expect(resposta.valoresCitados.map((v) => v.valorFormatado)).toContain(verbaLivre);
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });

  it('🔴 sinaliza valor em R$ que NENHUMA ferramenta devolveu', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'situacao_hoje', argumentos: {} }] },
      { tipo: 'TEXTO', texto: 'Você pode gastar R$ 999.999,99 hoje.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'quanto posso gastar?' });

    expect(resposta.valoresNaoRastreados).toContain('R$ 999.999,99');
  });

  it('resposta sem nenhuma ferramenta é marcada como opinião', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'Depende do seu objetivo.' }]);

    const resposta = await responder(depsCom(ia), { pergunta: 'devo investir?' });

    expect(resposta.semFerramenta).toBe(true);
    expect(resposta.ferramentasUsadas).toEqual([]);
  });

  it('soma o consumo de tokens de todos os turnos', async () => {
    const ia = new FakeProvedorIA([
      {
        tipo: 'FERRAMENTAS',
        chamadas: [{ nome: 'situacao_hoje', argumentos: {} }],
        consumo: { entrada: 100, saida: 10 },
      },
      { tipo: 'TEXTO', texto: 'ok', consumo: { entrada: 300, saida: 40 } },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'oi' });

    expect(resposta.consumo).toEqual({ entrada: 400, saida: 50 });
  });
});

describe('histórico', () => {
  it('é passado por parâmetro e chega ao provedor depois do prompt de sistema', async () => {
    const historico: MensagemIA[] = [
      { papel: 'usuario', conteudo: 'quanto gastei ontem?' },
      { papel: 'assistente', conteudo: 'R$ 120,00.' },
    ];
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'ok' }]);

    await responder(depsCom(ia), { pergunta: 'e hoje?', historico });

    const enviadas = ia.chamadas[0]?.mensagens ?? [];
    expect(enviadas[0]?.papel).toBe('sistema');
    expect(enviadas[1]).toEqual(historico[0]);
    expect(enviadas[2]).toEqual(historico[1]);
    expect(enviadas[3]).toEqual({ papel: 'usuario', conteudo: 'e hoje?' });
  });

  it('não guarda estado entre chamadas', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'TEXTO', texto: 'um' },
      { tipo: 'TEXTO', texto: 'dois' },
    ]);
    const deps = depsCom(ia);

    await responder(deps, { pergunta: 'primeira' });
    await responder(deps, { pergunta: 'segunda' });

    // Sem histórico explícito, a segunda chamada não carrega a primeira.
    expect(ia.chamadas[1]?.mensagens).toHaveLength(2);
  });
});

describe('🔴 auditoria do prompt de sistema', () => {
  it('não contém nenhuma fórmula de cálculo', () => {
    // Formas de FÓRMULA, não palavras. `/some\b/` seria falso positivo: a
    // própria proibição ("não some, não subtraia") contém a palavra.
    const formulas = [
      /renda\s*[-−]\s*poupan/i,
      /verba\s*[-−]\s*parcela/i,
      /fixos\s*[-−]/i,
      /[×x*]\s*12\b/,
      /\/\s*12\b/,
      /=\s*\w+\s*[-−+]\s*\w+/,
      /dividid[ao]\s+por/i,
      /multiplic\w+\s+por/i,
    ];

    for (const formula of formulas) {
      expect(
        formula.test(PROMPT_SISTEMA),
        `prompt contém algo com cara de fórmula: ${String(formula)}`,
      ).toBe(false);
    }
  });

  it('proíbe aritmética explicitamente', () => {
    expect(PROMPT_SISTEMA).toMatch(/NUNCA faça conta/);
    expect(PROMPT_SISTEMA).toMatch(/não some, não subtraia/i);
  });

  it('obriga a citar a string formatada', () => {
    expect(PROMPT_SISTEMA).toMatch(/Formatado/);
    expect(PROMPT_SISTEMA).toMatch(/nunca reconstrua o valor/i);
  });

  it('obriga a admitir que não sabe', () => {
    expect(PROMPT_SISTEMA).toMatch(/não tem essa informação/i);
    expect(PROMPT_SISTEMA).toMatch(/não estime/i);
  });

  it('carrega a regra de rótulo de bolso (SPEC 13)', () => {
    expect(PROMPT_SISTEMA).toMatch(/não rotule um número sem dizer de qual bolso/i);
    expect(PROMPT_SISTEMA).toMatch(/verba livre/i);
  });

  it('declara que o copiloto é read-only', () => {
    expect(PROMPT_SISTEMA).toMatch(/só consegue LER/i);
    expect(PROMPT_SISTEMA).toMatch(/não lança gastos/i);
  });

  it('pede texto puro, sem markdown', () => {
    expect(PROMPT_SISTEMA).toMatch(/não use markdown/i);
  });

  it('proíbe emoji e gamificação (SPEC 11)', () => {
    expect(PROMPT_SISTEMA).toMatch(/Sem emoji/i);
    expect(PROMPT_SISTEMA).toMatch(/gamificação/i);
    // E o próprio prompt não usa emoji.
    expect(PROMPT_SISTEMA).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
