/**
 * `?cotacao=` da tela `/projecao`: cotação simulada do dólar. Texto livre da
 * barra de endereço -> micros inteiros dentro da faixa do slider, ou `null`.
 * A page e a rota de CSV leem o mesmo parâmetro, então a regra vive aqui.
 */
import { parseTaxaMicros } from '@/shared/dinheiro';

export const COTACAO_MIN_MICROS = 4_800_000;
export const COTACAO_MAX_MICROS = 6_500_000;

export function lerCotacao(param: string | string[] | undefined): number | null {
  const valor = Array.isArray(param) ? param[0] : param;
  if (valor === undefined) return null;
  try {
    return Math.min(COTACAO_MAX_MICROS, Math.max(COTACAO_MIN_MICROS, parseTaxaMicros(valor)));
  } catch {
    return null;
  }
}
