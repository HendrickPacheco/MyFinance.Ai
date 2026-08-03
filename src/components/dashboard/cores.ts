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
