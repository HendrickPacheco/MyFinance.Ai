/**
 * Kernel de dinheiro. Toda grandeza monetária no app é `Int` em centavos.
 * Este módulo é puro (sem I/O, sem Date global) e é a ÚNICA fonte de
 * formatação, parsing e rateio de centavos. Ver SPEC seções 4, 5.3 e regra 11.
 */

const CENTAVOS_POR_UNIDADE = 100;

/** Garante que um número é um inteiro de centavos válido. */
export function assertCentavos(valor: number, rotulo = 'valor'): number {
  if (!Number.isInteger(valor)) {
    throw new TypeError(`${rotulo} precisa ser inteiro em centavos, recebido: ${valor}`);
  }
  return valor;
}

/** Formata centavos como moeda BRL: 123456 -> "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  assertCentavos(cents, 'cents');
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / CENTAVOS_POR_UNIDADE);
}

/** Formata centavos de dólar: 730000 -> "US$ 7.300,00". */
export function formatUSD(cents: number): string {
  assertCentavos(cents, 'cents');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(
    cents / CENTAVOS_POR_UNIDADE,
  );
}

/**
 * Formata taxa em micros (taxa × 1.000.000) como BRL, de 2 a 4 casas:
 * 5_430_000 -> "R$ 5,43"; 5_430_600 -> "R$ 5,4306". Aritmética inteira.
 */
export function formatTaxaBRL(taxaMicros: number): string {
  assertCentavos(taxaMicros, 'taxaMicros');
  const dezMilesimos = Math.round(taxaMicros / 100);
  const inteiros = Math.floor(dezMilesimos / 10_000);
  const frac = String(dezMilesimos % 10_000)
    .padStart(4, '0')
    .replace(/0+$/, '')
    .padEnd(2, '0');
  return `R$ ${inteiros.toLocaleString('pt-BR')},${frac}`;
}

/** Converte centavos da moeda de origem em centavos de BRL: floor(valor × taxa / 1e6). */
export function converterParaBrlCents(valorOrigemCents: number, taxaMicros: number): number {
  assertCentavos(valorOrigemCents, 'valorOrigemCents');
  assertCentavos(taxaMicros, 'taxaMicros');
  const produto = valorOrigemCents * taxaMicros;
  if (!Number.isSafeInteger(produto)) {
    throw new RangeError('Conversão excede o inteiro seguro');
  }
  return Math.floor(produto / 1_000_000);
}

/**
 * Formata centavos como decimal pt-BR SEM símbolo e SEM separador de milhar:
 * 123456 -> "1234,56"; -50 -> "-0,50".
 *
 * É o formato de célula de planilha (CSV): a vírgula decimal é o que o Excel
 * pt-BR entende como número, e o ponto de milhar de `formatBRL` faria a coluna
 * chegar como texto. Aritmética de inteiros, nunca `toFixed` sobre float —
 * dinheiro não passa por `Number` decimal em ponto nenhum (regra 1).
 */
export function formatarDecimalBR(cents: number): string {
  assertCentavos(cents, 'cents');
  const sinal = cents < 0 ? '-' : '';
  const absoluto = Math.abs(cents);
  const inteiros = Math.floor(absoluto / CENTAVOS_POR_UNIDADE);
  const centavos = absoluto % CENTAVOS_POR_UNIDADE;
  return `${sinal}${inteiros},${String(centavos).padStart(2, '0')}`;
}

/**
 * Converte uma entrada digitada pelo usuário em centavos inteiros.
 * Aceita "R$ 1.234,56", "1.234,56", "1234,56", "1234", "50".
 * Regra BR: ponto é separador de milhar, vírgula é decimal.
 */
export function parseBRL(entrada: string): number {
  if (typeof entrada !== 'string') {
    throw new TypeError('parseBRL espera uma string');
  }

  const semRuido = entrada
    .trim()
    .replace(/\s/g, '')
    .replace(/r\$/i, '')
    .replace(/\./g, '') // remove separadores de milhar
    .replace(',', '.'); // vírgula decimal -> ponto

  if (semRuido === '' || semRuido === '-') {
    throw new Error(`valor monetário vazio: "${entrada}"`);
  }

  const numero = Number(semRuido);
  if (Number.isNaN(numero)) {
    throw new Error(`valor monetário inválido: "${entrada}"`);
  }

  return Math.round(numero * CENTAVOS_POR_UNIDADE);
}

/**
 * Cotação digitada ("5,43", "5.4306") -> micros inteiros, sem passar por float.
 * Rejeita mais de 6 casas decimais em vez de arredondar em silêncio.
 */
export function parseTaxaMicros(entrada: string): number {
  const m = /^(\d+)(?:[.,](\d{1,6}))?$/.exec(entrada.trim());
  if (!m) throw new Error(`cotação inválida: "${entrada}" (use até 6 casas decimais)`);
  return Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'));
}

/** Soma uma lista de centavos garantindo inteireza. */
export function somaCents(valores: readonly number[]): number {
  return valores.reduce((acc, v) => acc + assertCentavos(v), 0);
}

/**
 * Rateia um total em N partes inteiras (SPEC regra 11):
 * cada parte é floor(total/N); o resto acumulado vai para a ÚLTIMA parte.
 * A soma das partes é SEMPRE exatamente igual ao total.
 *
 *   ratearCents(999, 3)  -> [333, 333, 333]
 *   ratearCents(1000, 3) -> [333, 333, 334]
 */
export function ratearCents(totalCents: number, partes: number): number[] {
  assertCentavos(totalCents, 'totalCents');
  if (!Number.isInteger(partes) || partes <= 0) {
    throw new RangeError(`número de partes inválido: ${partes}`);
  }

  const base = Math.floor(totalCents / partes);
  const resto = totalCents - base * partes;

  return Array.from({ length: partes }, (_, i) =>
    i === partes - 1 ? base + resto : base,
  );
}

/**
 * Número BRL sem símbolo, omitindo ",00" quando redondo: 287900 -> "2.879";
 * 91755 -> "917,55". Para telas que mostram o "R$" à parte (menor, apagado).
 */
export function formatarNumeroBRL(cents: number): string {
  assertCentavos(cents, 'cents');
  const inteiro = cents % CENTAVOS_POR_UNIDADE === 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: inteiro ? 0 : 2,
  }).format(cents / CENTAVOS_POR_UNIDADE);
}

/** Reais inteiros (half-up, só exibição): 287950 -> "2.880"; 8349 -> "83". */
export function formatarReaisInteiros(cents: number): string {
  assertCentavos(cents, 'cents');
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(
    Math.floor(cents / CENTAVOS_POR_UNIDADE + 0.5),
  );
}

/**
 * Rótulo curto de ponto de gráfico, em reais inteiros: >= 10.000 vira "10,6k"
 * (exceto quando `completo`, ex.: o último ponto -> "11.300"); abaixo, "5.379".
 */
export function formatarRotuloGrafico(cents: number, completo = false): string {
  const reais = Math.round(cents / CENTAVOS_POR_UNIDADE);
  if (reais >= 10_000 && !completo) {
    return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(reais / 1000)}k`;
  }
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(reais);
}
