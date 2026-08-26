/**
 * Compra parcelada (SPEC regra 4). Gera N parcelas, uma por ciclo a partir do
 * ciclo da compra. valorParcela = floor(total/N); o resto vai para a ÚLTIMA
 * parcela, então a soma das parcelas é SEMPRE exatamente o total.
 *
 * A competência de cada parcela é dataCompra + k meses (k = 0..N-1), com clamp
 * de fim de mês. O vínculo ao ciclo (cicloId) é feito por data pela camada de
 * aplicação quando cada ciclo nasce — o motor não conhece ciclos futuros.
 *
 * `parcelaInicial` (default 1, TASKS-IMPORTACAO §15.3 / D-17c) existe para a
 * importação de uma compra parcelada que o app só passou a conhecer a partir
 * de uma parcela intermediária (ex.: 12x, importada a partir da 3ª — as duas
 * primeiras já caíram em ciclo fechado e NUNCA podem nascer aqui). Gera-se
 * SÓ de `parcelaInicial` até `numParcelas`, com `parcelaNum` preservando o
 * número real da parcela (3..12, não 1..10) — o registro tem que ficar
 * honesto sobre ter sido uma compra de 12x, não fingir uma compra de 10x.
 * `dataCompra` continua sendo a competência da PRIMEIRA parcela da compra
 * ORIGINAL (parcela 1), nunca a da parcela em que a importação começou.
 *
 * 🔴 `valorTotalCents` deixa de significar "valor da compra inteira" quando
 * `parcelaInicial > 1`: ele é a soma de só as parcelas EFETIVAMENTE GERADAS
 * (as que ainda vão ser lançadas). Por isso `ratearCents` divide por
 * `numParcelas - parcelaInicial + 1` (a contagem de parcelas geradas), nunca
 * por `numParcelas`. Passar o valor da compra original aqui dentro de uma
 * importação parcial produziria um valor de parcela plausível e FALSO — este
 * repo já pagou esse preço três vezes (decisões D-13, D-14, D-15 no
 * CLAUDE.md). A invariante que os testes provam: a soma das parcelas geradas
 * é SEMPRE exatamente `valorTotalCents`.
 */
import { addMeses, assertData, type DataCivil } from '@/shared/data';
import { ratearCents } from '@/shared/dinheiro';

export interface ParcelaGerada {
  parcelaNum: number; // 1-based, número real dentro da compra original
  data: DataCivil; // competência
  valorCents: number;
}

export function gerarParcelas(params: {
  valorTotalCents: number;
  numParcelas: number;
  dataCompra: DataCivil;
  parcelaInicial?: number;
}): ParcelaGerada[] {
  assertData(params.dataCompra);
  if (!Number.isInteger(params.numParcelas) || params.numParcelas <= 0) {
    throw new RangeError(`numParcelas inválido: ${params.numParcelas}`);
  }

  const parcelaInicial = params.parcelaInicial ?? 1;
  if (
    !Number.isInteger(parcelaInicial) ||
    parcelaInicial < 1 ||
    parcelaInicial > params.numParcelas
  ) {
    throw new RangeError(`parcelaInicial inválido: ${parcelaInicial}`);
  }

  const quantidadeGerada = params.numParcelas - parcelaInicial + 1;
  const valores = ratearCents(params.valorTotalCents, quantidadeGerada);

  return valores.map((valorCents, i) => ({
    parcelaNum: parcelaInicial + i,
    data: addMeses(params.dataCompra, parcelaInicial - 1 + i),
    valorCents,
  }));
}
