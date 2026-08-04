/**
 * SPIKE — verificação de capacidade do modelo (tarefa A0.5).
 *
 * NÃO faz parte do app: vive em `scripts/`, não é importado por nada em
 * `src/` e não entra no bundle. Rode com:
 *
 *   pnpm ia:verificar
 *
 * Existe para responder, ANTES de construir o catálogo de ferramentas, a
 * pergunta de que a Fase D inteira depende: este modelo escolhe a ferramenta
 * certa entre várias parecidas, respeita o tipo declarado dos argumentos e
 * admite quando não sabe? Descobrir isso na D5 custaria a fase toda.
 *
 * Gasta tokens de verdade. O custo de uma execução é da ordem de centavos.
 */
import { z } from 'zod';
import { criarProvedorIA } from '../src/infrastructure/ia/provedor-ia';
import { ErroProvedorIA, type DefinicaoFerramenta, type ProvedorIAPort } from '../src/domain/ports/ia';

/**
 * Cinco ferramentas com descrições DE PROPÓSITO parecidas. Uma ferramenta só
 * não prova nada — o risco real é escolha errada entre opções próximas.
 */
const FERRAMENTAS: DefinicaoFerramenta[] = [
  {
    nome: 'situacao_hoje',
    descricao: 'Quanto pode gastar HOJE: teto do dia e quanto ainda resta hoje.',
    argumentos: z.object({}),
  },
  {
    nome: 'estado_ciclo',
    descricao: 'Situação do ciclo inteiro: verba, ritmo de gasto e projeção de fechamento.',
    argumentos: z.object({}),
  },
  {
    nome: 'projetar_ciclos',
    descricao: 'Projeta os próximos N ciclos financeiros à frente.',
    argumentos: z.object({
      numCiclos: z.number().int().min(1).max(60).describe('Quantos ciclos projetar.'),
    }),
  },
  {
    nome: 'gastos_por_categoria',
    descricao: 'Quanto foi gasto por categoria a partir de uma data.',
    argumentos: z.object({
      desde: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe('Data civil inicial, no formato YYYY-MM-DD.'),
    }),
  },
  {
    nome: 'analise_corte',
    descricao: 'Sugere onde cortar gasto, olhando os últimos 3 ciclos.',
    argumentos: z.object({}),
  },
];

/** Respostas de mentira, só para alimentar o turno seguinte do spike. */
const RESULTADO_FALSO: Record<string, string> = {
  situacao_hoje: '{"tetoHojeCents":8300,"tetoHojeFormatado":"R$ 83,00","restaHojeCents":5120,"restaHojeFormatado":"R$ 51,20"}',
  estado_ciclo: '{"verbaVariavelCents":1500000,"verbaVariavelFormatado":"R$ 15.000,00"}',
  projetar_ciclos: '{"ciclos":[{"inicio":"2026-09-01","verbaLivreCents":900000,"verbaLivreFormatado":"R$ 9.000,00"}]}',
  gastos_por_categoria: '{"categorias":[{"nome":"Alimentação","totalCents":120000,"totalFormatado":"R$ 1.200,00"}]}',
  analise_corte: '{"sugestoes":[{"categoria":"Assinaturas","economiaCents":8900,"economiaFormatado":"R$ 89,00"}]}',
};

interface Resultado {
  nome: string;
  passou: boolean;
  detalhe: string;
}

const resultados: Resultado[] = [];
let tokensEntrada = 0;
let tokensSaida = 0;

function registrar(nome: string, passou: boolean, detalhe: string): void {
  resultados.push({ nome, passou, detalhe });
  console.log(`${passou ? '  OK  ' : ' FALHA'}  ${nome}\n         ${detalhe}`);
}

async function turno(provedor: ProvedorIAPort, mensagens: Parameters<ProvedorIAPort['completarComTools']>[0]['mensagens']) {
  const r = await provedor.completarComTools({ mensagens, ferramentas: FERRAMENTAS });
  tokensEntrada += r.consumo?.entrada ?? 0;
  tokensSaida += r.consumo?.saida ?? 0;
  return r;
}

const SISTEMA =
  'Você responde perguntas sobre as finanças pessoais do usuário. Você NÃO faz contas: ' +
  'todo número vem de ferramenta. Se nenhuma ferramenta cobre a pergunta, diga que não tem ' +
  'essa informação em vez de estimar.';

/** 1. Escolhe a ferramenta certa entre cinco parecidas, em 3 perguntas distintas. */
async function verificarEscolha(provedor: ProvedorIAPort): Promise<void> {
  const casos = [
    { pergunta: 'quanto eu posso gastar hoje?', esperado: 'situacao_hoje' },
    { pergunta: 'onde eu consigo cortar gasto?', esperado: 'analise_corte' },
    { pergunta: 'como vão ficar os próximos 6 ciclos?', esperado: 'projetar_ciclos' },
  ];

  for (const caso of casos) {
    const { resposta } = await turno(provedor, [
      { papel: 'sistema', conteudo: SISTEMA },
      { papel: 'usuario', conteudo: caso.pergunta },
    ]);

    if (resposta.tipo !== 'FERRAMENTAS') {
      registrar(`escolha: "${caso.pergunta}"`, false, `respondeu texto sem chamar ferramenta: ${resposta.texto.slice(0, 120)}`);
      continue;
    }

    const escolhida = resposta.chamadas[0]?.nome ?? '(nenhuma)';
    registrar(
      `escolha: "${caso.pergunta}"`,
      escolhida === caso.esperado,
      `esperado ${caso.esperado}, veio ${escolhida}`,
    );
  }
}

/** 2. Aderência estrita de tipo: int onde o schema pede int, data em YYYY-MM-DD. */
async function verificarAderencia(provedor: ProvedorIAPort): Promise<void> {
  const { resposta: r1 } = await turno(provedor, [
    { papel: 'sistema', conteudo: SISTEMA },
    { papel: 'usuario', conteudo: 'projete os próximos doze ciclos pra mim' },
  ]);

  if (r1.tipo === 'FERRAMENTAS' && r1.chamadas[0]?.nome === 'projetar_ciclos') {
    const args = r1.chamadas[0].argumentos as { numCiclos?: unknown };
    registrar(
      'aderência: numCiclos é inteiro',
      Number.isInteger(args.numCiclos),
      `numCiclos = ${JSON.stringify(args.numCiclos)} (${typeof args.numCiclos})`,
    );
  } else {
    registrar('aderência: numCiclos é inteiro', false, 'não chamou projetar_ciclos');
  }

  const { resposta: r2 } = await turno(provedor, [
    { papel: 'sistema', conteudo: SISTEMA },
    { papel: 'usuario', conteudo: 'quanto gastei por categoria desde 15 de março de 2026?' },
  ]);

  if (r2.tipo === 'FERRAMENTAS' && r2.chamadas[0]?.nome === 'gastos_por_categoria') {
    const args = r2.chamadas[0].argumentos as { desde?: unknown };
    const ok = typeof args.desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.desde);
    registrar('aderência: data em YYYY-MM-DD', ok, `desde = ${JSON.stringify(args.desde)}`);
  } else {
    registrar('aderência: data em YYYY-MM-DD', false, 'não chamou gastos_por_categoria');
  }
}

/** 3. Turno múltiplo: recebe o resultado da ferramenta e fecha (ou pede outra). */
async function verificarTurnoMultiplo(provedor: ProvedorIAPort): Promise<void> {
  const inicio: Parameters<ProvedorIAPort['completarComTools']>[0]['mensagens'] = [
    { papel: 'sistema', conteudo: SISTEMA },
    { papel: 'usuario', conteudo: 'quanto posso gastar hoje?' },
  ];

  const { resposta: primeira } = await turno(provedor, inicio);
  if (primeira.tipo !== 'FERRAMENTAS') {
    registrar('turno múltiplo', false, 'primeiro turno não pediu ferramenta');
    return;
  }

  const chamada = primeira.chamadas[0];
  if (!chamada) {
    registrar('turno múltiplo', false, 'turno FERRAMENTAS sem nenhuma chamada');
    return;
  }

  const { resposta: segunda } = await turno(provedor, [
    ...inicio,
    { papel: 'assistente', conteudo: '', chamadas: primeira.chamadas },
    {
      papel: 'ferramenta',
      idChamada: chamada.id,
      nome: chamada.nome,
      conteudo: RESULTADO_FALSO[chamada.nome] ?? '{}',
    },
  ]);

  const citouValor = segunda.tipo === 'TEXTO' && /R\$\s?51,20/.test(segunda.texto);
  registrar(
    'turno múltiplo',
    segunda.tipo === 'TEXTO' || segunda.tipo === 'FERRAMENTAS',
    segunda.tipo === 'TEXTO'
      ? `fechou com texto${citouValor ? ', citando a string formatada da ferramenta' : ' (NÃO citou R$ 51,20 — checar no prompt da D3)'}: ${segunda.texto.slice(0, 140)}`
      : 'pediu outra ferramenta (também é comportamento válido)',
  );
}

/** 4. Recusa honesta: pergunta que nenhuma ferramenta cobre. */
async function verificarRecusa(provedor: ProvedorIAPort): Promise<void> {
  const { resposta } = await turno(provedor, [
    { papel: 'sistema', conteudo: SISTEMA },
    { papel: 'usuario', conteudo: 'qual foi a cotação do dólar no dia em que fiz minha maior compra?' },
  ]);

  if (resposta.tipo !== 'TEXTO') {
    registrar('recusa honesta', false, `chamou ${resposta.chamadas.map((c) => c.nome).join(', ')} em vez de admitir que não sabe`);
    return;
  }

  const admitiu = /não (tenho|sei|consigo|possuo)|não há|sem (essa|acesso)/i.test(resposta.texto);
  registrar('recusa honesta', admitiu, resposta.texto.slice(0, 200));
}

async function main(): Promise<void> {
  const modelo = process.env.OPENAI_MODEL ?? '(não configurado)';
  console.log(`\nVerificação de capacidade — modelo: ${modelo}`);
  console.log(`Data: ${new Date().toISOString().slice(0, 10)}\n`);

  const provedor = criarProvedorIA();

  await verificarEscolha(provedor);
  await verificarAderencia(provedor);
  await verificarTurnoMultiplo(provedor);
  await verificarRecusa(provedor);

  const falhas = resultados.filter((r) => !r.passou);
  console.log('\n─────────────────────────────────────────────');
  console.log(`${resultados.length - falhas.length}/${resultados.length} verificações passaram`);
  console.log(`Tokens: ${tokensEntrada} entrada · ${tokensSaida} saída`);
  console.log(
    `Custo aproximado desta execução: US$ ${((tokensEntrada / 1e6) * 2 + (tokensSaida / 1e6) * 12).toFixed(4)}`,
  );

  if (falhas.length > 0) {
    console.log('\nACHADO BLOQUEANTE — a D1 muda. Ver o plano B na tarefa A0.5 do TASKS-IA.md:');
    for (const f of falhas) console.log(`  · ${f.nome}: ${f.detalhe}`);
  }
  console.log('\nRegistre o resultado no README.md, com a data.\n');

  process.exitCode = falhas.length > 0 ? 1 : 0;
}

main().catch((erro: unknown) => {
  if (erro instanceof ErroProvedorIA) {
    console.error(`\nErroProvedorIA(${erro.motivo}): ${erro.message}\n`);
  } else {
    console.error(erro);
  }
  process.exitCode = 1;
});
