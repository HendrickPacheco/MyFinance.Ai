/**
 * Paleta categórica do painel desktop — validada (6 checks de contraste e
 * CVD) contra a superfície `#14171f` do app. Ordem FIXA de slots, nunca
 * ciclada. Cor segue a entidade, nunca o ranking: quem decide o slot de cada
 * categoria/método é a identidade (id/enum), não a posição no array vindo do
 * read-model (que costuma vir ordenado por valor para exibição).
 *
 * A partir do 9º item, tudo vira uma fatia "Outros" em cinza neutro — nunca
 * se gera uma 9ª cor.
 */
import type { MetodoPagamento } from '@/domain/model/enums';
import { METODO_PAGAMENTO } from '@/domain/model/enums';

export const PALETA_CATEGORICA = [
  '#3987e5', // azul
  '#d95926', // laranja
  '#199e70', // aqua
  '#c98500', // amarelo
  '#d55181', // magenta
  '#008300', // verde
  '#9085e9', // violeta
  '#e66767', // vermelho
] as const;

/** Cor neutra para a fatia "Outros" e para "sem método informado". */
export const COR_OUTROS = '#626b7a';

const MAX_SLOTS = PALETA_CATEGORICA.length;

export interface FatiaComCor<T> {
  item: T;
  cor: string;
  rotulo: string;
}

/**
 * Atribui cor estável por identidade (não por posição/rank) a uma lista de
 * itens, dobrando o 9º+ em "Outros". `chaveId` extrai o identificador
 * estável do item; `ordenarPara` é a ordem já pronta para exibição (ex.: por
 * valor desc) — pode diferir da ordem usada para atribuir cor.
 */
export function atribuirCoresCategoricas<T>(
  itensOrdenadosParaExibicao: readonly T[],
  chaveId: (item: T) => string,
): FatiaComCor<T>[] {
  // Ordem de atribuição de cor é pela chave de identidade (estável), não
  // pelo rank de exibição — assim reordenar por valor não repinta fatias.
  const chavesEmOrdemEstavel = [...itensOrdenadosParaExibicao]
    .map(chaveId)
    .sort((a, b) => a.localeCompare(b));

  const corPorChave = new Map<string, string>();
  chavesEmOrdemEstavel.forEach((chave, index) => {
    corPorChave.set(chave, index < MAX_SLOTS ? (PALETA_CATEGORICA[index] ?? COR_OUTROS) : COR_OUTROS);
  });

  return itensOrdenadosParaExibicao.map((item) => ({
    item,
    cor: corPorChave.get(chaveId(item)) ?? COR_OUTROS,
    rotulo: chaveId(item),
  }));
}

/**
 * ---------------------------------------------------------------------------
 * Séries da projeção (`/projecao`) — coluna empilhada da composição da renda.
 * ---------------------------------------------------------------------------
 * Indexado por IDENTIDADE de série, nunca por ordem de renderização: trocar a
 * ordem da pilha, esconder uma série ou reordenar as linhas não repinta nada.
 *
 * Os hexes saem todos de `PALETA_CATEGORICA` (slots fixos abaixo) e a
 * combinação foi revalidada com o validador do dataviz contra a surface
 * `#14171f` — 6 checks PASS, pior par adjacente `#199e70`↔`#c98500` ΔE 8.4 em
 * protanopia e 19.8 em visão normal, contraste ≥ 3:1.
 *
 * `--color-accent` (#6ea8fe) NÃO entra como série: reprova a banda de
 * luminosidade no escuro (L 0.729 contra o teto 0.67). Ele segue sendo cor de
 * interação, não de dado.
 */
export type SerieProjecao = 'fixos' | 'provisao' | 'poupanca' | 'parcelas' | 'verbaLivre';

export const CORES_PROJECAO: Record<SerieProjecao, string> = {
  fixos: PALETA_CATEGORICA[6], // violeta
  provisao: PALETA_CATEGORICA[3], // amarelo
  poupanca: PALETA_CATEGORICA[2], // aqua
  parcelas: PALETA_CATEGORICA[1], // laranja
  verbaLivre: PALETA_CATEGORICA[0], // azul
};

export const LABEL_PROJECAO: Record<SerieProjecao, string> = {
  fixos: 'Custos fixos',
  provisao: 'Provisão',
  poupanca: 'Poupança-alvo',
  parcelas: 'Parcelas',
  verbaLivre: 'Verba livre',
};

/**
 * Ordem da pilha, de BAIXO para CIMA. A verba livre é o topo de propósito: o
 * topo é o único segmento cuja variação o olho acompanha numa pilha, e como o
 * teto (renda prevista) é quase plano, a altura do segmento superior lê-se
 * direto como "quanto sobra". Parcelas fica colada nela para que o encolher do
 * laranja e o crescer do azul sejam um movimento só, na mesma fronteira.
 *
 * A legenda usa esta mesma ordem (SPEC do plano), então a leitura é aprendida
 * uma vez e vale no gráfico, na tabela e na micro-barra do mobile.
 */
export const ORDEM_PILHA_PROJECAO: readonly SerieProjecao[] = [
  'fixos',
  'provisao',
  'poupanca',
  'parcelas',
  'verbaLivre',
];

/** Slot fixo por método de pagamento — ordem do enum, nunca ciclada. */
export const COR_METODO: Record<MetodoPagamento, string> = Object.fromEntries(
  METODO_PAGAMENTO.map((metodo, index) => [
    metodo,
    index < PALETA_CATEGORICA.length ? PALETA_CATEGORICA[index]! : COR_OUTROS,
  ]),
) as Record<MetodoPagamento, string>;

export const LABEL_METODO: Record<MetodoPagamento, string> = {
  PIX: 'Pix',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  DINHEIRO: 'Dinheiro',
  BOLETO: 'Boleto',
};
