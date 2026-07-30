/**
 * Compra parcelada (SPEC regra 4). Gera N parcelas, uma por ciclo a partir do
 * ciclo da compra. valorParcela = floor(total/N); o resto vai para a ÚLTIMA
 * parcela, então a soma das parcelas é SEMPRE exatamente o total.
 *
 * A competência de cada parcela é dataCompra + k meses (k = 0..N-1), com clamp
 * de fim de mês. O vínculo ao ciclo (cicloId) é feito por data pela camada de
 * aplicação quando cada ciclo nasce — o motor não conhece ciclos futuros.
 */
import { addMeses, assertData, type DataCivil } from '@/shared/data';
import { ratearCents } from '@/shared/dinheiro';

export interface ParcelaGerada {
  parcelaNum: number; // 1-based
  data: DataCivil; // competência
  valorCents: number;
}

export function gerarParcelas(params: {
  valorTotalCents: number;
  numParcelas: number;
  dataCompra: DataCivil;
}): ParcelaGerada[] {
  assertData(params.dataCompra);
  if (!Number.isInteger(params.numParcelas) || params.numParcelas <= 0) {
    throw new RangeError(`numParcelas inválido: ${params.numParcelas}`);
  }

  const valores = ratearCents(params.valorTotalCents, params.numParcelas);

  return valores.map((valorCents, i) => ({
    parcelaNum: i + 1,
    data: addMeses(params.dataCompra, i),
    valorCents,
  }));
}
