/**
 * Extração de fatura (I3 do `TASKS-IMPORTACAO.md`, §5 e §9.3).
 *
 * O modelo entra UMA ÚNICA vez em toda a importação, e só para TRANSCREVER o
 * texto colado da fatura em linhas estruturadas. Ele não concilia — isso é
 * `conciliarFatura`, função pura já pronta — e não grava nada (regra 7b do
 * CLAUDE.md: a IA nunca grava direto). Este caso de uso não persiste
 * `ItemExtraido` nenhum; devolve a lista para quem chama decidir o que fazer.
 *
 * Dois campos decisórios são deliberadamente RECUSADOS ao modelo, e resolvidos
 * por função pura (§9.3 literal — campo "deduzido" pelo modelo não é
 * confiável, campo resolvido por função pura é):
 *
 *  - **Ano da data.** A fatura imprime só "dia/mês" ("12/03", "12 MAR"). O
 *    modelo devolve `dataOriginalTexto` como está impresso; `resolverAnoDaFatura`
 *    (função pura, `domain/finance/importacao-data.ts`) decide o ano a partir
 *    da competência informada pelo dono. Data que não resolve entra como
 *    `data: null` — nunca chutada, e a linha continua na lista (só a data
 *    fica ausente; a linha em si não é descartada por isso).
 *
 *  - **Categoria.** Nem id, nem nome — não está no schema. Categoria é
 *    inferência, e a linha entra sem ela para o dono classificar depois.
 *
 * Linha totalmente ilegível: o prompt instrui o modelo a OMITI-LA em vez de
 * inventar (inventar uma linha é erro pior que perder uma). Não há como este
 * caso de uso distinguir "linha omitida" de "linha que nunca existiu" —
 * a defesa contra chute mora inteira no prompt, não em pós-filtro aqui.
 *
 * Fatiamento em blocos de ~20 linhas (achado operacional do plano, §4.1):
 * `IA_TIMEOUT_MS` é 60s por padrão, e uma chamada única com a fatura inteira
 * raspa ou estoura esse timeout. Cada bloco é uma chamada independente à
 * porta; os consumos de token somam e `ordem` é contínua entre blocos.
 */
import type { Deps } from '../deps';
import { exigirOwner } from '@/domain/auth/permissoes';
import { avaliarLimiteIA } from '../limite-ia';
import { z } from 'zod';
import type { MensagemIA } from '@/domain/ports/ia';
import { lerDiaMes, resolverAnoDaFatura } from '@/domain/finance/importacao-data';
import type { ItemExtraido } from '@/domain/finance/importacao-tipos';
import { CONFIANCA_TRANSCRICAO, SINAL_LINHA_FATURA } from '@/domain/model/enums';

/** Quantas linhas de texto viram uma única chamada ao modelo. Ver cabeçalho. */
const LINHAS_POR_LOTE = 20;

export class ExtracaoIAIndisponivelError extends Error {
  constructor() {
    super('A extração por IA não está disponível nesta instalação.');
    this.name = 'ExtracaoIAIndisponivelError';
  }
}

export class LimiteIAExcedidoNaExtracaoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'LimiteIAExcedidoNaExtracaoError';
  }
}

export interface ExtrairItensDaFaturaInput {
  /** Texto colado da fatura, uma linha de gasto por linha de texto. */
  texto: string;
  /** "YYYY-MM" — competência da fatura, informada pelo dono no upload. */
  competenciaRef: string;
}

export interface ExtrairItensDaFaturaResultado {
  itens: ItemExtraido[];
  consumo: { entrada: number; saida: number };
}

/**
 * Schema do que o MODELO devolve por linha — deliberadamente mais estreito que
 * `ItemExtraido`: sem `ordem` (o bloco decide a posição, não o modelo) e sem
 * `data` resolvida (só o texto cru). Todo campo é obrigatório e os opcionais
 * são `.nullable()` — `paraJsonSchemaEstrito` não aceita `.optional()`.
 */
const ITEM_TRANSCRITO_SCHEMA = z.object({
  descricaoOriginal: z.string().min(1),
  /** Centavos, sempre positivo — o sentido do gasto vai em `sinal`. */
  valorCents: z.number().int().positive(),
  // `z.enum` direto sobre a união canônica de `model/enums.ts`: sem cópia da
  // lista aqui, e sem cast — se um sinal novo nascer lá, este schema o aceita
  // no mesmo commit.
  sinal: z.enum(SINAL_LINHA_FATURA),
  /** Exatamente como impresso: "12/03", "12 MAR". Nunca inclui ano. */
  dataOriginalTexto: z.string().min(1),
  /** Só preenchido se a fatura IMPRIME parcelamento ("3/12", "PARC 03/12"). */
  parcelaAtual: z.number().int().positive().nullable(),
  parcelaTotal: z.number().int().positive().nullable(),
  confianca: z.enum(CONFIANCA_TRANSCRICAO),
});

const LOTE_TRANSCRITO_SCHEMA = z.object({
  itens: z.array(ITEM_TRANSCRITO_SCHEMA),
});

type ItemTranscrito = z.infer<typeof ITEM_TRANSCRITO_SCHEMA>;

const PROMPT_SISTEMA = [
  'Você transcreve linhas de uma fatura de cartão de crédito para dados estruturados.',
  'Sua única tarefa é LER O TEXTO E TRANSCREVER. Você nunca calcula, nunca deduz categoria e nunca inventa ano — só o que está impresso.',
  'Regras:',
  '1. valorCents é o valor em CENTAVOS, inteiro e sempre POSITIVO (ex.: "R$ 45,90" vira 4590). O sentido do gasto (compra, estorno, tarifa, pagamento de fatura) vai só no campo "sinal", nunca no sinal do número.',
  '2. dataOriginalTexto é a data exatamente como impressa (ex.: "12/03", "12 MAR"). Nunca adicione ano — ele não está no papel.',
  '3. parcelaAtual e parcelaTotal só são preenchidos se a PRÓPRIA LINHA imprimir parcelamento (ex.: "3/12", "PARC 03/12", "03 DE 12"). Caso contrário os dois vêm null. Nunca infira parcelamento por valor redondo ou por a linha parecer recorrente.',
  '4. Nunca inclua categoria — não faz parte da tarefa.',
  '5. Se não conseguir ler uma linha com confiança nenhuma, OMITA-A da resposta. Inventar uma linha que não existe é um erro pior do que deixar uma linha de fora.',
  '6. confianca mede o quão bem você leu o TEXTO impresso, não se o valor "faz sentido" financeiramente.',
].join('\n');

/** Divide linhas não vazias em blocos de até `LINHAS_POR_LOTE`. */
function dividirEmLotes(texto: string): string[][] {
  const linhas = texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);

  const lotes: string[][] = [];
  for (let inicio = 0; inicio < linhas.length; inicio += LINHAS_POR_LOTE) {
    lotes.push(linhas.slice(inicio, inicio + LINHAS_POR_LOTE));
  }
  return lotes;
}

/**
 * Resolve `dataOriginalTexto` em data civil via as funções puras de
 * `importacao-data.ts`. `null` em qualquer etapa — texto não reconhecido,
 * combinação ambígua entre os dois anos candidatos — vira `data: null`, nunca
 * um chute.
 */
function resolverData(dataOriginalTexto: string, competenciaRef: string): string | null {
  const diaMes = lerDiaMes(dataOriginalTexto);
  if (!diaMes) return null;

  const resolvida = resolverAnoDaFatura({ diaMes, competenciaRef });
  return 'data' in resolvida ? resolvida.data : null;
}

/** `null` a menos que a fatura imprima um par completo e coerente de parcela. */
function resolverParcela(item: ItemTranscrito): { atual: number; total: number } | null {
  if (item.parcelaAtual == null || item.parcelaTotal == null) return null;
  if (item.parcelaAtual > item.parcelaTotal) return null;
  return { atual: item.parcelaAtual, total: item.parcelaTotal };
}

function paraItemExtraido(item: ItemTranscrito, ordem: number, competenciaRef: string): ItemExtraido {
  return {
    ordem,
    descricaoOriginal: item.descricaoOriginal,
    valorCents: item.valorCents,
    sinal: item.sinal,
    data: resolverData(item.dataOriginalTexto, competenciaRef),
    dataOriginalTexto: item.dataOriginalTexto,
    parcela: resolverParcela(item),
    confianca: item.confianca,
  };
}

/**
 * Checa o teto diário de IA e lança se estourado — ANTES de gastar dinheiro
 * com a chamada, não depois. Mesmo contrato de três passos documentado em
 * `limite-ia.ts:56-67`. `usoIA` é opcional em `Deps` pelo mesmo motivo que
 * `ia` (instalação com `IA_HABILITADA=false`); sem contador não há teto para
 * checar, no mesmo espírito de `vetorizarSeMePermitirem` em `memoria.ts`.
 */
async function garantirTetoIA(deps: Deps): Promise<void> {
  if (!deps.usoIA) return;
  const uso = await deps.usoIA.doDia(deps.relogio.hoje());
  const veredicto = avaliarLimiteIA(uso);
  if (!veredicto.permitido) {
    throw new LimiteIAExcedidoNaExtracaoError(veredicto.motivo);
  }
}

/**
 * Extrai itens de UM bloco de linhas. Isolado do loop principal para manter
 * `extrairItensDaFatura` de baixa complexidade ciclomática.
 */
async function extrairLote(
  deps: Deps,
  ia: NonNullable<Deps['ia']>,
  linhasDoLote: readonly string[],
): Promise<{ itens: readonly ItemTranscrito[]; consumo: { entrada: number; saida: number } }> {
  await garantirTetoIA(deps);

  const mensagens: MensagemIA[] = [
    { papel: 'sistema', conteudo: PROMPT_SISTEMA },
    { papel: 'usuario', conteudo: linhasDoLote.join('\n') },
  ];

  const { dados, consumo } = await ia.completarComSchema({
    mensagens,
    schema: LOTE_TRANSCRITO_SCHEMA,
    nomeDoSchema: 'itens_transcritos_da_fatura',
  });

  if (deps.usoIA) {
    await deps.usoIA.incrementar(deps.relogio.hoje(), {
      requisicoes: 1,
      tokensEntrada: consumo?.entrada ?? 0,
      tokensSaida: consumo?.saida ?? 0,
    });
  }

  return {
    itens: dados.itens,
    consumo: { entrada: consumo?.entrada ?? 0, saida: consumo?.saida ?? 0 },
  };
}

/**
 * Extrai os itens de uma fatura colada como texto. OWNER-only (IA gasta
 * dinheiro real — DA-3); com `deps.ia` ausente (camada desligada), lança
 * `ExtracaoIAIndisponivelError` em vez de seguir sem transcrever nada.
 */
export async function extrairItensDaFatura(
  deps: Deps,
  entrada: ExtrairItensDaFaturaInput,
): Promise<ExtrairItensDaFaturaResultado> {
  exigirOwner(deps.ator);

  if (entrada.texto.trim().length === 0) {
    return { itens: [], consumo: { entrada: 0, saida: 0 } };
  }

  if (!deps.ia) {
    throw new ExtracaoIAIndisponivelError();
  }
  const ia = deps.ia;

  const lotes = dividirEmLotes(entrada.texto);

  const itens: ItemExtraido[] = [];
  let tokensEntrada = 0;
  let tokensSaida = 0;

  for (const linhasDoLote of lotes) {
    const resultado = await extrairLote(deps, ia, linhasDoLote);
    for (const itemTranscrito of resultado.itens) {
      itens.push(paraItemExtraido(itemTranscrito, itens.length, entrada.competenciaRef));
    }
    tokensEntrada += resultado.consumo.entrada;
    tokensSaida += resultado.consumo.saida;
  }

  return { itens, consumo: { entrada: tokensEntrada, saida: tokensSaida } };
}
