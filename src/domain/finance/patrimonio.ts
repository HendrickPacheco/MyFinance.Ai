/**
 * Patrimônio (SPEC 5.6). Visão independente do fluxo de caixa. `mesesDeReserva`
 * é o número de destaque: traduz patrimônio em segurança.
 */
import { somaCents } from '@/shared/dinheiro';

/** Total de um snapshot = soma dos itens. */
export function totalPatrimonioCents(itensValoresCents: readonly number[]): number {
  return somaCents(itensValoresCents);
}

/** Variação entre o mês atual e o anterior (pode ser negativa). */
export function variacaoMensalCents(totalAtualCents: number, totalAnteriorCents: number): number {
  return totalAtualCents - totalAnteriorCents;
}

/**
 * Taxa de acumulação média: média das variações dos últimos `janela` snapshots.
 * Recebe os totais em ordem cronológica; calcula as diferenças consecutivas.
 * Indicador de leitura (pode ser fracionário).
 */
export function taxaAcumulacaoMediaCents(
  totaisCronologicos: readonly number[],
  janela = 6,
): number {
  if (totaisCronologicos.length < 2) return 0;

  const variacoes: number[] = [];
  for (let i = 1; i < totaisCronologicos.length; i++) {
    variacoes.push((totaisCronologicos[i] as number) - (totaisCronologicos[i - 1] as number));
  }

  const ultimas = variacoes.slice(-janela);
  const soma = ultimas.reduce((a, b) => a + b, 0);
  return soma / ultimas.length;
}

/**
 * Meses de reserva = saldo das contas de reserva / custo mensal médio.
 * Indicador de leitura (fracionário). Custo <= 0 devolve 0 (evita Infinity na UI).
 */
export function mesesDeReserva(params: {
  saldoReservaCents: number;
  custoMensalMedioCents: number;
}): number {
  if (params.custoMensalMedioCents <= 0) return 0;
  return params.saldoReservaCents / params.custoMensalMedioCents;
}
