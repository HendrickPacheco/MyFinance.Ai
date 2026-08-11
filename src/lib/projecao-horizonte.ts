/**
 * Horizonte da tela `/projecao` — leitura e saneamento do parâmetro de URL.
 *
 * POR QUE ISTO EXISTE EM VEZ DE UM `Number(searchParams.horizonte)` NA PAGE:
 * `?horizonte=` é texto livre digitado por quem tem a barra de endereço, e
 * `projetarCiclos` valida a faixa [1, 60] lançando `RangeError`. Sem
 * saneamento, `?horizonte=999` (ou `?horizonte=abc`) derruba a rota com 500 —
 * uma tela de leitura não pode quebrar por causa de um parâmetro torto.
 *
 * O horizonte mora na URL, e não em `useState`, porque a página é um Server
 * Component e o link precisa ser compartilhável (§3.4). Duas superfícies leem
 * o mesmo parâmetro — a página e a rota de CSV — e por isso a regra vive aqui,
 * num módulo só: um clamp divergente exportaria um CSV de horizonte diferente
 * do que está na tela.
 */

/** Os únicos horizontes oferecidos pelo seletor (§3.4). */
export const HORIZONTES_PROJECAO = [6, 12, 24] as const;

export type HorizonteProjecao = (typeof HORIZONTES_PROJECAO)[number];

export const HORIZONTE_PADRAO: HorizonteProjecao = 12;

/**
 * Converte o parâmetro cru no horizonte oferecido mais próximo.
 *
 * Aproximar em vez de recusar é deliberado: `?horizonte=999` quer dizer "o
 * máximo que der" e recebe 24; `?horizonte=1` recebe 6. Só o que não é número
 * cai no padrão, porque aí não há intenção a preservar.
 */
export function lerHorizonte(bruto: string | string[] | undefined): HorizonteProjecao {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (valor === undefined || valor.trim() === '') return HORIZONTE_PADRAO;

  const numero = Number(valor);
  if (!Number.isFinite(numero)) return HORIZONTE_PADRAO;

  return HORIZONTES_PROJECAO.reduce<HorizonteProjecao>(
    (melhor, opcao) =>
      Math.abs(opcao - numero) < Math.abs(melhor - numero) ? opcao : melhor,
    HORIZONTE_PADRAO,
  );
}

/** URL canônica da tela para um horizonte — usada pelo seletor e pelo CSV. */
export function hrefProjecao(horizonte: HorizonteProjecao): string {
  return `/projecao?horizonte=${String(horizonte)}`;
}

export function hrefCsvProjecao(horizonte: HorizonteProjecao): string {
  return `/api/projecao/csv?horizonte=${String(horizonte)}`;
}
