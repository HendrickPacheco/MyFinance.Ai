/**
 * Loop do agente (D3): pergunta → chamadas de ferramenta → resposta.
 *
 * O que este arquivo garante, e que nenhuma outra camada consegue garantir:
 *
 *  · LIMITE DURO DE TURNOS. Estourou, responde honestamente que não concluiu.
 *    Nunca um palpite montado com dados parciais.
 *  · PROVENIÊNCIA. Devolve quais ferramentas foram usadas e quais valores
 *    formatados delas aparecem no texto final — é o que permite à UI mostrar
 *    que o número veio do motor.
 *  · DETECÇÃO DE VALOR NÃO RASTREADO. Se o texto final cita um "R$ ..." que
 *    nenhuma ferramenta devolveu, isso é sinalizado. É a rede de segurança
 *    contra o risco nº 1 do plano: alucinação de número, que é pior que mock
 *    em tela porque parece verdade.
 *
 * Sem estado global: o histórico entra por parâmetro (CLAUDE.md regra 6).
 * Nenhum cálculo mora aqui — este arquivo orquestra, não conta.
 */
import type { Deps } from '@/application/deps';
import { exigirOwner } from '@/domain/auth/permissoes';
import { avaliarLimiteIA } from '@/application/limite-ia';
import { parseBRL } from '@/shared/dinheiro';
import type { ChamadaFerramenta, ConsumoTokens, MensagemIA } from '@/domain/ports/ia';
import { FERRAMENTAS_DE_PROPOSTA, definicoesParaProvedor } from './ferramentas/catalogo';
import { executarFerramenta } from './ferramentas';
import type { SaidaFerramenta } from './ferramentas/saida';
import { propostaSchema, type PropostaExibivel } from './propostas';
import {
  MENSAGEM_LIMITE_DE_TURNOS,
  MENSAGEM_SEM_RESPOSTA,
  PROMPT_SISTEMA,
  blocoDeMemoria,
} from './prompt-sistema';

/** Teto de idas ao modelo numa única pergunta. Defesa de custo e de loop. */
export const MAX_TURNOS = 6;

/**
 * Teto de memórias no prompt de sistema. Elas viajam em TODO turno, então o
 * custo é multiplicado pelo número de turnos da pergunta — é a mesma razão de
 * o histórico ser cortado na server action.
 */
export const MAX_MEMORIAS_NO_PROMPT = 30;

/** Encontra "R$ 1.234,56" no texto — o formato que `formatBRL` produz. */
const VALOR_BRL = /R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;

/**
 * Encontra abreviações comuns em português para valor monetário: "70k",
 * "1,5k", "70 mil". Cobre só ISSO — formas mais elaboradas ("70 mil e
 * quinhentos", "setenta mil") ficam de fora de propósito: capturar errado
 * mascararia uma alucinação de verdade (falso negativo), o que é PIOR que não
 * capturar (falso positivo já coberto por outro caminho). Ver `responder()`.
 */
const VALOR_ABREVIADO = /(\d+(?:[.,]\d+)?)\s*(k|mil)\b/gi;

/**
 * Valor SEM os centavos, na forma que uma pessoa escreve mas `formatBRL` nunca
 * emite: "R$ 70.000", "R$ 70000", "70.000".
 *
 * Só vale para o texto do DONO (`centsInformadosPeloDono`) — nunca para
 * detectar valor na resposta do modelo, onde a exigência de `,dd` do
 * `VALOR_BRL` é justamente o que evita confundir número solto com dinheiro.
 *
 * Duas formas aceitas, ambas escolhidas por serem inequivocamente monetárias:
 *  - qualquer número prefixado por `R$`;
 *  - número com separador de milhar em ponto ("70.000"), que em pt-BR não
 *    aparece por acaso — um ano ("2026") ou uma contagem ("3 parcelas") não
 *    tem ponto.
 *
 * Inteiro solto sem `R$` nem separador ("70000") fica DE FORA de propósito:
 * aceitá-lo transformaria qualquer número da pergunta em anistia para uma
 * alucinação que coincidisse com ele. Falso negativo aqui (deixar de reconhecer
 * um valor do dono) custa um alerta indevido; falso positivo custa uma
 * alucinação silenciada, que é muito pior.
 */
const VALOR_SEM_CENTAVOS = /R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?![\d.,])|(\d{1,3}(?:\.\d{3})+)(?![\d,])/g;

export class CopilotoIndisponivelError extends Error {
  constructor() {
    super(
      'A camada de IA está desligada. Preencha OPENAI_API_KEY e IA_HABILITADA=true no .env para usar o copiloto.',
    );
    this.name = 'CopilotoIndisponivelError';
  }
}

/** Teto diário de uso da IA atingido (limite-ia.ts). */
export class LimiteIAExcedidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'LimiteIAExcedidoError';
  }
}

export interface FerramentaUsada {
  nome: string;
  argumentos: unknown;
  /** Função pura de origem, para a UI exibir proveniência. */
  comoFoiCalculado: string | null;
  /** A ferramenta devolveu `{ erro }` em vez de dado. */
  falhou: boolean;
}

export interface ValorCitado {
  valorFormatado: string;
  ferramenta: string;
  campo: string;
}

export interface RespostaCopiloto {
  texto: string;
  ferramentasUsadas: FerramentaUsada[];
  /**
   * Escritas que o copiloto PREPAROU e que ainda não existem (decisão D-8).
   * A UI as mostra com um botão; quem grava é `confirmarProposta`, por clique
   * do dono. Uma resposta com proposta não mudou nada no banco.
   */
  propostas: PropostaExibivel[];
  /** Valores do texto final que vieram comprovadamente de uma ferramenta. */
  valoresCitados: ValorCitado[];
  /**
   * Valores em R$ no texto final que NENHUMA ferramenta devolveu, mas que o
   * PRÓPRIO DONO informou — na pergunta atual ou em algum turno anterior da
   * mesma conversa. Origem conhecida: repetir o número que o usuário digitou
   * não é alucinação, e por isso este balde NUNCA aciona o alerta vermelho
   * (caso real 11/08/2026: perguntou "juntar 70k", a resposta citou
   * "R$ 70.000,00" e foi acusada de valor sem origem — o próprio usuário era a
   * origem).
   */
  valoresInformados: string[];
  /**
   * Valores em R$ no texto final que NENHUMA ferramenta devolveu E que o dono
   * também não informou. Não vazio = o modelo inventou ou recompôs um número
   * do nada. A UI trata isso como alerta.
   */
  valoresNaoRastreados: string[];
  /** Resposta sem nenhuma ferramenta é opinião, não dado (a UI sinaliza). */
  semFerramenta: boolean;
  /** `true` quando o loop foi cortado pelo limite de turnos. */
  incompleta: boolean;
  turnosUsados: number;
  consumo: ConsumoTokens;
}

/**
 * Os três passos exigidos por `application/limite-ia.ts`, nesta ordem.
 *
 * Ficam AQUI, no caso de uso, e não na server action: `permissoes.ts` manda
 * checar na primeira linha do caso de uso, antes de qualquer I/O. Assim
 * qualquer chamador futuro (outra action, um script, um job) herda a proteção
 * em vez de precisar lembrar dela.
 *
 * A ordem economiza dinheiro: a negativa acontece ANTES de falar com o
 * provedor. Registrar depois não desfaz uma chamada já paga.
 */
export async function responder(
  deps: Deps,
  entrada: { pergunta: string; historico?: readonly MensagemIA[] },
): Promise<RespostaCopiloto> {
  // 1. IA gasta dinheiro real do dono — VIEWER não dispara (decisão DA-3).
  exigirOwner(deps.ator);

  const ia = deps.ia;
  if (!ia) throw new CopilotoIndisponivelError();

  const hoje = deps.relogio.hoje();

  // 2. Teto diário, avaliado antes de qualquer chamada ao provedor.
  if (deps.usoIA) {
    const veredicto = avaliarLimiteIA(await deps.usoIA.doDia(hoje));
    if (!veredicto.permitido) throw new LimiteIAExcedidoError(veredicto.motivo);
  }

  const consumoAcumulado: ConsumoTokens = { entrada: 0, saida: 0 };
  try {
    return await executarLoop(deps, ia, entrada, consumoAcumulado);
  } finally {
    // 3. Registra o que foi gasto, inclusive quando o loop falhou no meio —
    // os turnos anteriores já foram cobrados pelo provedor.
    await registrarUso(deps, hoje, consumoAcumulado);
  }
}

/**
 * Nunca deixa a contabilização derrubar a resposta: roda num `finally`, e uma
 * exceção aqui mascararia o erro original do loop.
 */
async function registrarUso(deps: Deps, dia: string, consumo: ConsumoTokens): Promise<void> {
  if (!deps.usoIA) return;
  try {
    await deps.usoIA.incrementar(dia, {
      requisicoes: 1,
      tokensEntrada: consumo.entrada,
      tokensSaida: consumo.saida,
    });
  } catch {
    // Contador indisponível não é motivo para perder a resposta já obtida.
  }
}

/**
 * Planos, preferências e contexto de vida entram no prompt de sistema (Fase E).
 *
 * Leitura pura de banco, sem embedding: são poucas linhas e mudam o tom de
 * toda resposta, então não faz sentido pagar uma vetorização por turno para
 * decidir se entram. Conversas antigas ficam de fora — para essas o modelo
 * chama `buscar_memoria` quando precisar.
 *
 * Falha aqui NÃO derruba a pergunta: um copiloto sem memória ainda responde;
 * um copiloto que quebra porque a memória falhou, não.
 */
async function contextoDeMemoria(deps: Deps): Promise<string> {
  if (!deps.memorias) return '';
  try {
    const memorias = await deps.memorias.listar({
      tipos: ['PLANO', 'PREFERENCIA', 'CONTEXTO'],
      limite: MAX_MEMORIAS_NO_PROMPT,
    });
    return blocoDeMemoria(memorias);
  } catch {
    return '';
  }
}

async function executarLoop(
  deps: Deps,
  ia: NonNullable<Deps['ia']>,
  entrada: { pergunta: string; historico?: readonly MensagemIA[] },
  consumo: ConsumoTokens,
): Promise<RespostaCopiloto> {
  const mensagens: MensagemIA[] = [
    { papel: 'sistema', conteudo: PROMPT_SISTEMA + (await contextoDeMemoria(deps)) },
    ...(entrada.historico ?? []),
    { papel: 'usuario', conteudo: entrada.pergunta },
  ];

  const ferramentas = definicoesParaProvedor();
  const usadas: FerramentaUsada[] = [];
  const saidas: { nome: string; saida: SaidaFerramenta }[] = [];

  for (let turno = 1; turno <= MAX_TURNOS; turno += 1) {
    const resultado = await ia.completarComTools({ mensagens, ferramentas });
    consumo.entrada += resultado.consumo?.entrada ?? 0;
    consumo.saida += resultado.consumo?.saida ?? 0;

    if (resultado.resposta.tipo === 'TEXTO') {
      return montarResposta({
        texto: resultado.resposta.texto || MENSAGEM_SEM_RESPOSTA,
        usadas,
        saidas,
        incompleta: false,
        turnosUsados: turno,
        consumo,
        pergunta: entrada.pergunta,
        historico: entrada.historico ?? [],
      });
    }

    mensagens.push({ papel: 'assistente', conteudo: '', chamadas: resultado.resposta.chamadas });

    for (const chamada of resultado.resposta.chamadas) {
      const saida = await executarFerramenta(deps, chamada.nome, chamada.argumentos);
      usadas.push(registrar(chamada, saida));
      saidas.push({ nome: chamada.nome, saida });
      mensagens.push({
        papel: 'ferramenta',
        idChamada: chamada.id,
        nome: chamada.nome,
        conteudo: JSON.stringify(saida),
      });
    }
  }

  // Estourou o limite. Resposta honesta, sem nenhum número — o modelo pode ter
  // visto dados parciais, e narrar meia resposta é pior que admitir a falha.
  return montarResposta({
    texto: MENSAGEM_LIMITE_DE_TURNOS,
    usadas,
    saidas,
    incompleta: true,
    turnosUsados: MAX_TURNOS,
    consumo,
    pergunta: entrada.pergunta,
    historico: entrada.historico ?? [],
  });
}

function registrar(chamada: ChamadaFerramenta, saida: SaidaFerramenta): FerramentaUsada {
  const comoFoiCalculado = saida.comoFoiCalculado;
  return {
    nome: chamada.nome,
    argumentos: chamada.argumentos,
    comoFoiCalculado: typeof comoFoiCalculado === 'string' ? comoFoiCalculado : null,
    falhou: saida.erro !== undefined,
  };
}

/**
 * Recolhe as propostas devolvidas pelas ferramentas `propor_*` (D-8).
 *
 * Revalida cada uma contra `propostaSchema` mesmo tendo a ferramenta acabado
 * de validar. Não é paranoia gratuita: é a mesma razão pela qual o registro de
 * ferramentas revalida os argumentos do modelo — a saída aqui chega tipada
 * como `unknown`, e o objeto vai para a UI e volta para uma action de ESCRITA.
 * Confiar que alguém já validou é exatamente como o dado errado entra.
 *
 * Proposta malformada é descartada em silêncio: o texto do modelo continua
 * valendo, o dono simplesmente não vê um botão.
 */
function recolherPropostas(
  saidas: readonly { nome: string; saida: SaidaFerramenta }[],
): PropostaExibivel[] {
  const propostas: PropostaExibivel[] = [];
  const deProposta = new Set<string>(FERRAMENTAS_DE_PROPOSTA);

  for (const { nome, saida } of saidas) {
    if (!deProposta.has(nome)) continue;

    const exibivel = saida.proposta as PropostaExibivel | undefined;
    if (!exibivel || typeof exibivel !== 'object') continue;

    const validada = propostaSchema.safeParse(exibivel.proposta);
    if (!validada.success) continue;

    propostas.push({ ...exibivel, proposta: validada.data });
  }

  return propostas;
}

/** Todo par (campo, valor formatado) que as ferramentas devolveram. */
function valoresDisponiveis(
  saidas: readonly { nome: string; saida: SaidaFerramenta }[],
): ValorCitado[] {
  const encontrados: ValorCitado[] = [];

  const visitar = (valor: unknown, ferramenta: string): void => {
    if (Array.isArray(valor)) {
      for (const item of valor) visitar(item, ferramenta);
      return;
    }
    if (typeof valor !== 'object' || valor === null) return;

    for (const [campo, conteudo] of Object.entries(valor as Record<string, unknown>)) {
      if (campo.endsWith('Formatado') && typeof conteudo === 'string') {
        encontrados.push({ valorFormatado: conteudo, ferramenta, campo });
      }
      visitar(conteudo, ferramenta);
    }
  };

  for (const { nome, saida } of saidas) visitar(saida, nome);
  return encontrados;
}

/**
 * Todo valor em centavos que o DONO já colocou em jogo nesta conversa — na
 * pergunta atual ou em qualquer mensagem anterior dele no histórico. Cobre a
 * forma monetária completa ("R$ 70.000,00", via `parseBRL`) e a abreviação
 * comum ("70k", "70 mil", via `VALOR_ABREVIADO`).
 *
 * Só mensagens de papel 'usuario' entram — nunca 'assistente'. Se o modelo já
 * tiver citado um valor por conta própria num turno anterior, repeti-lo aqui
 * SEM ferramenta de novo não vira "informado": seria a mesma alucinação
 * escapando pela porta de trás, só porque já tinha escapado uma vez antes.
 */
function centsInformadosPeloDono(historico: readonly MensagemIA[], pergunta: string): Set<number> {
  const textosDoDono = [
    ...historico.filter((m) => m.papel === 'usuario').map((m) => m.conteudo),
    pergunta,
  ];

  const cents = new Set<number>();
  for (const texto of textosDoDono) {
    for (const bruto of texto.match(VALOR_BRL) ?? []) {
      try {
        cents.add(parseBRL(bruto));
      } catch {
        // Bateu o formato mas não parseou (caso extremo) — não é motivo pra
        // quebrar a resposta inteira; só não entra no conjunto conhecido.
      }
    }
    for (const match of texto.matchAll(VALOR_ABREVIADO)) {
      const numero = Number(match[1]?.replace(',', '.'));
      if (Number.isFinite(numero)) cents.add(Math.round(numero * 1000 * 100));
    }
    // "R$ 70.000" / "70.000" — sem centavos, forma que `formatBRL` nunca emite
    // mas que o dono escreve o tempo todo. Sem isto, perguntar "juntar 70.000"
    // e receber "R$ 70.000,00" de volta ainda acendia o alerta: mesmo defeito
    // do caso de 11/08, só com outra grafia.
    for (const match of texto.matchAll(VALOR_SEM_CENTAVOS)) {
      const bruto = match[1] ?? match[2];
      if (bruto === undefined) continue;
      const numero = Number(bruto.replace(/\./g, ''));
      if (Number.isFinite(numero)) cents.add(numero * 100);
    }
  }
  return cents;
}

function montarResposta(params: {
  texto: string;
  usadas: FerramentaUsada[];
  saidas: readonly { nome: string; saida: SaidaFerramenta }[];
  incompleta: boolean;
  turnosUsados: number;
  consumo: ConsumoTokens;
  pergunta: string;
  historico: readonly MensagemIA[];
}): RespostaCopiloto {
  const disponiveis = valoresDisponiveis(params.saidas);

  // Normaliza o espaço para não acusar falso positivo entre "R$ 83,00" e
  // "R$&nbsp;83,00": a comparação é sobre o valor, não sobre o byte.
  const normalizar = (s: string): string => s.replace(/\s/g, ' ');

  // A MESMA normalização vale aqui. Antes esta linha comparava byte a byte
  // enquanto o caminho do alerta normalizava: um valor de ferramenta citado
  // com espaço comum, em vez do NBSP que `formatBRL` emite, escapava do alerta
  // (certo) mas NÃO entrava em `citados` (errado) — a UI perdia a proveniência
  // de um número que veio do motor, em vez de exibi-la.
  const textoNormalizado = normalizar(params.texto);
  const citados = disponiveis.filter((v) =>
    textoNormalizado.includes(normalizar(v.valorFormatado)),
  );

  const conhecidos = new Set(disponiveis.map((v) => normalizar(v.valorFormatado)));
  const naoConfirmadosPorFerramenta = [
    ...new Set(
      (params.texto.match(VALOR_BRL) ?? [])
        .map(normalizar)
        .filter((valor) => !conhecidos.has(valor)),
    ),
  ];

  // Dos que sobraram sem ferramenta, separa quem o PRÓPRIO DONO já disse
  // (balde sem alerta) de quem ninguém disse (balde com alerta) — ver
  // `centsInformadosPeloDono` para o porquê de só o histórico do usuário contar.
  const centsDoDono = centsInformadosPeloDono(params.historico, params.pergunta);
  const informados: string[] = [];
  const naoRastreados: string[] = [];
  for (const valor of naoConfirmadosPorFerramenta) {
    let cents: number | null = null;
    try {
      cents = parseBRL(valor);
    } catch {
      cents = null;
    }
    if (cents !== null && centsDoDono.has(cents)) informados.push(valor);
    else naoRastreados.push(valor);
  }

  return {
    texto: params.texto,
    ferramentasUsadas: params.usadas,
    // Loop cortado pelo limite não oferece botão de confirmar: a resposta
    // admite não ter concluído, e um cartão "lançar R$ 47,00" ao lado dessa
    // frase pediria confirmação de algo que o modelo não terminou de pensar.
    propostas: params.incompleta ? [] : recolherPropostas(params.saidas),
    valoresCitados: citados,
    valoresInformados: informados,
    valoresNaoRastreados: naoRastreados,
    semFerramenta: params.usadas.length === 0,
    incompleta: params.incompleta,
    turnosUsados: params.turnosUsados,
    consumo: params.consumo,
  };
}
