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
