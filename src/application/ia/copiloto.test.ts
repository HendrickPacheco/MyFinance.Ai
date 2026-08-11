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
import { formatBRL } from '@/shared/dinheiro';
import { ErroProvedorIA, type MensagemIA } from '@/domain/ports/ia';
import { FakeProvedorIA } from '@/application/__fakes__/fake-provedor-ia';
import {
  criarDeps,
  cicloFake,
  transacaoFake,
  ATOR_VIEWER,
  FakeUsoIARepo,
  type FakeDeps,
} from '@/application/__fakes__/fakes-ciclo-fechamento';
import { ATOR_ANONIMO } from '@/domain/auth/ator';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import { LIMITES_IA_PADRAO } from '@/application/limite-ia';
import { executarFerramenta } from './ferramentas';
import { CopilotoIndisponivelError, LimiteIAExcedidoError, MAX_TURNOS, responder } from './copiloto';
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

describe('🔴 contrato de segurança da IA (limite-ia.ts)', () => {
  it('VIEWER não dispara a IA — ela gasta dinheiro do dono (DA-3)', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'não deveria chegar aqui' }]);
    const deps = { ...depsCom(ia), ator: ATOR_VIEWER };

    await expect(responder(deps, { pergunta: 'quanto posso gastar?' })).rejects.toBeInstanceOf(
      AcessoNegadoError,
    );
    // O provedor nem foi consultado: a negativa vem antes de gastar.
    expect(ia.chamadas).toHaveLength(0);
  });

  it('ator anônimo também é barrado', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'x' }]);
    const deps = { ...depsCom(ia), ator: ATOR_ANONIMO };

    await expect(responder(deps, { pergunta: 'oi' })).rejects.toBeInstanceOf(AcessoNegadoError);
    expect(ia.chamadas).toHaveLength(0);
  });

  it('teto diário de requisições nega ANTES de falar com o provedor', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'não deveria chegar aqui' }]);
    const deps = {
      ...depsCom(ia),
      usoIA: new FakeUsoIARepo({
        dia: HOJE,
        uso: { requisicoes: LIMITES_IA_PADRAO.requisicoesPorDia, tokensEntrada: 0, tokensSaida: 0 },
      }),
    };

    await expect(responder(deps, { pergunta: 'oi' })).rejects.toBeInstanceOf(LimiteIAExcedidoError);
    expect(ia.chamadas).toHaveLength(0);
  });

  it('teto diário de tokens também nega antes da chamada', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'x' }]);
    const deps = {
      ...depsCom(ia),
      usoIA: new FakeUsoIARepo({
        dia: HOJE,
        uso: { requisicoes: 1, tokensEntrada: LIMITES_IA_PADRAO.tokensPorDia, tokensSaida: 0 },
      }),
    };

    await expect(responder(deps, { pergunta: 'oi' })).rejects.toBeInstanceOf(LimiteIAExcedidoError);
    expect(ia.chamadas).toHaveLength(0);
  });

  it('registra requisição e tokens consumidos no dia', async () => {
    const ia = new FakeProvedorIA([
      {
        tipo: 'FERRAMENTAS',
        chamadas: [{ nome: 'situacao_hoje', argumentos: {} }],
        consumo: { entrada: 120, saida: 15 },
      },
      { tipo: 'TEXTO', texto: 'ok', consumo: { entrada: 400, saida: 60 } },
    ]);
    const deps = depsCom(ia);

    await responder(deps, { pergunta: 'quanto posso gastar?' });

    expect(deps.usoIA.incrementos).toEqual([
      { dia: HOJE, uso: { requisicoes: 1, tokensEntrada: 520, tokensSaida: 75 } },
    ]);
  });

  it('registra o consumo mesmo quando o provedor falha no meio', async () => {
    // Os turnos anteriores já foram cobrados — perder a contagem faria o teto
    // de custo subestimar o gasto real.
    const ia = new FakeProvedorIA([
      {
        tipo: 'FERRAMENTAS',
        chamadas: [{ nome: 'situacao_hoje', argumentos: {} }],
        consumo: { entrada: 300, saida: 20 },
      },
      { tipo: 'ERRO', motivo: 'INDISPONIVEL' },
    ]);
    const deps = depsCom(ia);

    await expect(responder(deps, { pergunta: 'oi' })).rejects.toBeInstanceOf(ErroProvedorIA);

    expect(deps.usoIA.incrementos).toEqual([
      { dia: HOJE, uso: { requisicoes: 1, tokensEntrada: 300, tokensSaida: 20 } },
    ]);
  });

  it('falha do contador não derruba a resposta já obtida', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'resposta boa' }]);
    const usoIA = new FakeUsoIARepo();
    usoIA.incrementar = () => Promise.reject(new Error('banco fora do ar'));

    const resposta = await responder({ ...depsCom(ia), usoIA }, { pergunta: 'oi' });

    expect(resposta.texto).toBe('resposta boa');
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

  /**
   * A asserção antiga era "o copiloto é read-only". A D-8 foi revista em
   * 04/08/2026: agora ele PREPARA ações. O que precisa ser garantido mudou de
   * "ele não pode" para "ele não pode DIZER QUE JÁ FEZ" — porque a única forma
   * de a escrita por proposta virar dano é o modelo narrar como concluído algo
   * que ainda depende de um clique.
   */
  it('proíbe o copiloto de afirmar que já executou a ação', () => {
    expect(PROMPT_SISTEMA).toMatch(/NUNCA diga que já foi feito/i);
    expect(PROMPT_SISTEMA).toMatch(/não gravam nada/i);
    expect(PROMPT_SISTEMA).toMatch(/peça a confirmação/i);
  });

  it('mantém fechar ciclo e configuração fora do alcance do copiloto', () => {
    expect(PROMPT_SISTEMA).toMatch(/Fechar ciclo e alterar configuração continuam fora/i);
  });

  it('repete ao modelo que memória não guarda dinheiro', () => {
    expect(PROMPT_SISTEMA).toMatch(/memória nunca contém valor em dinheiro/i);
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

/**
 * Escrita por proposta (decisão D-8) vista do LOOP.
 *
 * A prova de que a ferramenta não grava está em `ferramentas.test.ts`. O que
 * falta aqui é o outro lado do contrato: a proposta precisa CHEGAR à UI, e
 * chegar só quando é confiável.
 */
describe('propostas no loop (D-8)', () => {
  const CHAMADA_LANCAMENTO = {
    nome: 'propor_lancamento',
    argumentos: {
      valorCents: 4_700,
      descricao: 'Almoço',
      data: null,
      categoriaId: null,
      contaId: null,
      metodo: null,
    },
  };

  it('recolhe a proposta e a entrega junto da resposta, sem gravar nada', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [CHAMADA_LANCAMENTO] },
      { tipo: 'TEXTO', texto: 'Preparei o lançamento. Confirme abaixo para gravar.' },
    ]);
    const deps = depsCom(ia);

    const resposta = await responder(deps, { pergunta: 'gastei 47 no almoço' });

    expect(resposta.propostas).toHaveLength(1);
    expect(resposta.propostas[0]?.proposta.tipo).toBe('LANCAMENTO');
    // O banco não foi tocado: quem grava é a action, por clique do dono.
    expect(deps.transacoes.itens).toHaveLength(2); // as duas do cenário base
  });

  it('uma pergunta comum não produz proposta nenhuma', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'situacao_hoje', argumentos: {} }] },
      { tipo: 'TEXTO', texto: 'Você ainda pode gastar hoje.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'quanto posso gastar hoje?' });

    expect(resposta.propostas).toEqual([]);
  });

  it('proposta recusada pela ferramenta não vira botão', async () => {
    const ia = new FakeProvedorIA([
      {
        tipo: 'FERRAMENTAS',
        chamadas: [
          {
            nome: 'propor_memoria',
            // Valor monetário: a guarda pura recusa no turno da proposta.
            argumentos: { tipoMemoria: 'PLANO', texto: 'quer juntar R$ 50.000,00' },
          },
        ],
      },
      { tipo: 'TEXTO', texto: 'Não consigo guardar valores na memória.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'lembra que quero juntar 50 mil' });

    expect(resposta.propostas).toEqual([]);
    expect(resposta.ferramentasUsadas[0]?.falhou).toBe(true);
  });

  it('🔴 loop cortado por limite de turnos não oferece confirmação', async () => {
    // A resposta admite não ter concluído; um botão "lançar R$ 47,00" ao lado
    // dessa frase pediria confirmação de algo que o modelo não terminou.
    const ia = new FakeProvedorIA(
      Array.from({ length: MAX_TURNOS }, () => ({
        tipo: 'FERRAMENTAS' as const,
        chamadas: [CHAMADA_LANCAMENTO],
      })),
    );

    const resposta = await responder(depsCom(ia), { pergunta: 'gastei 47 no almoço' });

    expect(resposta.incompleta).toBe(true);
    expect(resposta.texto).toBe(MENSAGEM_LIMITE_DE_TURNOS);
    expect(resposta.propostas).toEqual([]);
  });

  it('o valor da proposta não é acusado de alucinação', async () => {
    // A proposta devolve o par `valorCents`/`valorFormatado`, então o detector
    // de valor não rastreado reconhece o número que o modelo cita.
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [CHAMADA_LANCAMENTO] },
      { tipo: 'TEXTO', texto: `Preparei o lançamento de ${formatBRL(4_700)}. Confirme abaixo.` },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'gastei 47 no almoço' });

    expect(resposta.valoresNaoRastreados).toEqual([]);
    expect(resposta.valoresCitados.map((v) => v.valorFormatado)).toContain(formatBRL(4_700));
  });
});

/**
 * OS TRÊS BALDES DE VALOR (correção de 11/08/2026).
 *
 * Caso real que gerou isto: o dono perguntou "quero juntar 70k até janeiro", a
 * resposta citou "R$ 70.000,00" e a UI acusou "Valor sem origem — não veio de
 * nenhuma consulta ao motor de cálculo". Ou seja: acusou o dono de alucinação
 * por repetirem o número dele mesmo.
 *
 * O estrago não é o alerta errado em si — é o dono aprender a ignorar o alerta.
 * Ele é a ÚNICA defesa contra número realmente inventado, e um detector que
 * grita à toa vira ruído de fundo.
 *
 * A classificação passou a ser em três baldes:
 *   · `valoresCitados`        — veio de saída de ferramenta;
 *   · `valoresInformados`     — o próprio dono disse (pergunta ou histórico dele);
 *   · `valoresNaoRastreados`  — sobrou. SÓ ESTE mantém o alerta.
 *
 * O teste que mais importa aqui é o do valor inventado continuar no terceiro
 * balde: sem ele, a correção vira anistia geral e o detector morre calado.
 */
describe('três baldes de valor — informado pelo dono não é alucinação', () => {
  it('🔴 o caso exato que falhou: perguntou "70k", a resposta cita R$ 70.000,00', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'situacao_hoje', argumentos: {} }] },
      { tipo: 'TEXTO', texto: 'Para juntar R$ 70.000,00 até janeiro, o ritmo é apertado.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'quero juntar 70k até janeiro' });

    expect(resposta.valoresInformados).toEqual(['R$ 70.000,00']);
    // O que a UI olha para acender o alerta vermelho tem que estar VAZIO.
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });

  it.each([
    ['abreviação com k', 'consigo juntar 70k até janeiro?'],
    ['abreviação por extenso', 'consigo juntar 70 mil até janeiro?'],
    ['forma monetária completa', 'consigo juntar R$ 70.000,00 até janeiro?'],
  ])('%s na pergunta reconhece R$ 70.000,00 na resposta', async (_forma, pergunta) => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'R$ 70.000,00 até janeiro dá.' }]);

    const resposta = await responder(depsCom(ia), { pergunta });

    expect(resposta.valoresInformados).toEqual(['R$ 70.000,00']);
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });

  it('a abreviação com decimal também conta: "1,5k" cobre R$ 1.500,00', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'R$ 1.500,00 por mês, então.' }]);

    const resposta = await responder(depsCom(ia), { pergunta: 'e se eu separar 1,5k por mês?' });

    expect(resposta.valoresNaoRastreados).toEqual([]);
    expect(resposta.valoresInformados).toEqual(['R$ 1.500,00']);
  });

  it('valor vindo de ferramenta fica em valoresCitados e NÃO migra para informados', async () => {
    // Se um valor do motor escorregasse para o balde "o dono disse", a UI
    // deixaria de exibir a proveniência — que é o oposto do objetivo.
    const saida = await executarFerramenta(depsCom(new FakeProvedorIA()), 'estado_ciclo', {});
    const verbaLivre = saida.verbaLivreFormatado as string;

    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'estado_ciclo', argumentos: {} }] },
      { tipo: 'TEXTO', texto: `Sua verba livre é ${verbaLivre}.` },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'quanto sobra?' });

    expect(resposta.valoresCitados.map((v) => v.valorFormatado)).toContain(verbaLivre);
    expect(resposta.valoresInformados).toEqual([]);
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });

  it('🔴 valor que o modelo inventou CONTINUA sendo alertado', async () => {
    // O teste que impede a correção de virar anistia geral. Nenhuma ferramenta
    // devolveu esse número e o dono nunca o digitou: é invenção, e o alerta
    // tem que sobreviver a toda a lógica dos outros dois baldes.
    const ia = new FakeProvedorIA([
      { tipo: 'FERRAMENTAS', chamadas: [{ nome: 'situacao_hoje', argumentos: {} }] },
      { tipo: 'TEXTO', texto: 'Você ainda pode gastar R$ 999.999,99 hoje.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'quanto posso gastar hoje?' });

    expect(resposta.valoresNaoRastreados).toEqual(['R$ 999.999,99']);
    expect(resposta.valoresInformados).toEqual([]);
  });

  it('🔴 um valor só citado pelo ASSISTENTE no histórico não vira "informado"', async () => {
    // Se contasse, bastaria a alucinação sobreviver a um turno para se
    // legitimar: o modelo repetiria o próprio número inventado e o alerta
    // sumiria — a porta dos fundos exata que `centsInformadosPeloDono` fecha.
    const historico: MensagemIA[] = [
      { papel: 'usuario', conteudo: 'como estou?' },
      { papel: 'assistente', conteudo: 'Você tem R$ 456.789,01 de reserva.' },
    ];
    const ia = new FakeProvedorIA([
      { tipo: 'TEXTO', texto: 'Como eu disse, R$ 456.789,01 de reserva.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'confirma?', historico });

    expect(resposta.valoresNaoRastreados).toEqual(['R$ 456.789,01']);
    expect(resposta.valoresInformados).toEqual([]);
  });

  it('o MESMO valor, dito pelo dono num turno anterior, é informado', async () => {
    // O contraste do teste acima: o que muda é só o papel da mensagem.
    const historico: MensagemIA[] = [
      { papel: 'usuario', conteudo: 'tenho R$ 456.789,01 guardados' },
      { papel: 'assistente', conteudo: 'Anotado.' },
    ];
    const ia = new FakeProvedorIA([
      { tipo: 'TEXTO', texto: 'Com os R$ 456.789,01 que você já tem, dá.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'e agora?', historico });

    expect(resposta.valoresInformados).toEqual(['R$ 456.789,01']);
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });

  it('abreviação num turno anterior do dono também vale', async () => {
    const historico: MensagemIA[] = [
      { papel: 'usuario', conteudo: 'minha meta é juntar 70 mil' },
      { papel: 'assistente', conteudo: 'Entendi.' },
    ];
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'Os R$ 70.000,00 saem em janeiro.' }]);

    const resposta = await responder(depsCom(ia), { pergunta: 'quando eu chego lá?', historico });

    expect(resposta.valoresInformados).toEqual(['R$ 70.000,00']);
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });

  it('espaço não-quebrável não vira falso alerta: R$ 83,00 é R$ 83,00', async () => {
    // `formatBRL` emite U+00A0 entre "R$" e o número; o modelo escreve espaço
    // comum. Comparar byte a byte acusaria o mesmo valor de ser inventado.
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'Separe R$ 83,00 por dia.' }]);

    const resposta = await responder(depsCom(ia), { pergunta: 'e se eu separar R$ 83,00 por dia?' });

    expect(resposta.valoresNaoRastreados).toEqual([]);
    expect(resposta.valoresInformados).toEqual(['R$ 83,00']);
  });

  it('o mesmo valor citado duas vezes na resposta aparece uma vez só no balde', async () => {
    const ia = new FakeProvedorIA([
      { tipo: 'TEXTO', texto: 'R$ 70.000,00 até janeiro. Sim, R$ 70.000,00 dá.' },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'juntar 70k dá?' });

    expect(resposta.valoresInformados).toEqual(['R$ 70.000,00']);
  });

  it('informado e inventado convivem: só o inventado é alertado', async () => {
    const ia = new FakeProvedorIA([
      {
        tipo: 'TEXTO',
        texto: 'Para os R$ 70.000,00 que você quer, sobram R$ 12.345,67 por ciclo.',
      },
    ]);

    const resposta = await responder(depsCom(ia), { pergunta: 'juntar 70k até janeiro?' });

    expect(resposta.valoresInformados).toEqual(['R$ 70.000,00']);
    expect(resposta.valoresNaoRastreados).toEqual(['R$ 12.345,67']);
  });

  /**
   * Esta grafia era um limite conhecido e virou correção: "70.000" sem centavos
   * não casa com `VALOR_BRL` (que exige ",dd") nem com a abreviação, e antes do
   * `VALOR_SEM_CENTAVOS` repetir esse número na resposta acendia o alerta — o
   * mesmo defeito do caso de 11/08, só com outra grafia do dono.
   */
  it('"70.000" sem centavos na pergunta conta como informado', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'R$ 70.000,00 até janeiro.' }]);

    const resposta = await responder(depsCom(ia), { pergunta: 'quero juntar 70.000 até janeiro' });

    expect(resposta.valoresInformados).toEqual(['R$ 70.000,00']);
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });

  it('"R$ 70.000" sem centavos também conta como informado', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'R$ 70.000,00 até janeiro.' }]);

    const resposta = await responder(depsCom(ia), {
      pergunta: 'quero juntar R$ 70.000 até janeiro',
    });

    expect(resposta.valoresInformados).toEqual(['R$ 70.000,00']);
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });

  /**
   * A guarda que impede a correção acima de virar anistia geral: inteiro solto,
   * sem `R$` e sem separador de milhar, NÃO é tratado como valor informado.
   * Aceitá-lo faria qualquer número da pergunta (um ano, uma contagem de
   * parcelas) silenciar uma alucinação que coincidisse com ele.
   */
  it('inteiro solto na pergunta NÃO silencia o alerta', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'Vai custar R$ 2.026,00.' }]);

    const resposta = await responder(depsCom(ia), { pergunta: 'o que acontece em 2026?' });

    expect(resposta.valoresInformados).toEqual([]);
    expect(resposta.valoresNaoRastreados).toEqual(['R$ 2.026,00']);
  });

  it('resposta sem nenhum valor em R$ não enche nenhum dos dois baldes', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'Depende do seu objetivo.' }]);

    const resposta = await responder(depsCom(ia), { pergunta: 'juntar 70k é muito?' });

    expect(resposta.valoresInformados).toEqual([]);
    expect(resposta.valoresNaoRastreados).toEqual([]);
  });
});

/** Memória injetada no prompt de sistema (Fase E, tarefa E6). */
describe('memória no prompt de sistema', () => {
  it('injeta planos, preferências e contexto — e não conversas', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'ok' }]);
    const deps = depsCom(ia);
    await deps.memorias.criar({
      tipo: 'PLANO',
      texto: 'quer sair do aluguel até 2028',
      origem: 'USUARIO',
      embedding: null,
    });
    await deps.memorias.criar({
      tipo: 'CONVERSA',
      texto: 'comentou que viajou em julho',
      origem: 'USUARIO',
      embedding: null,
    });

    await responder(deps, { pergunta: 'e aí?' });

    const sistema = ia.chamadas[0]?.mensagens.find((m) => m.papel === 'sistema');
    expect(sistema?.conteudo).toContain('quer sair do aluguel até 2028');
    // CONVERSA fica de fora: para essas existe `buscar_memoria` sob demanda,
    // senão toda pergunta pagaria por histórico irrelevante.
    expect(sistema?.conteudo).not.toContain('comentou que viajou em julho');
  });

  it('sem memória, o prompt de sistema fica idêntico ao original', async () => {
    const ia = new FakeProvedorIA([{ tipo: 'TEXTO', texto: 'ok' }]);

    await responder(depsCom(ia), { pergunta: 'e aí?' });

    const sistema = ia.chamadas[0]?.mensagens.find((m) => m.papel === 'sistema');
    expect(sistema?.conteudo).toBe(PROMPT_SISTEMA);
  });
});
