/**
 * Sobra de um ciclo (SPEC regra 7 e regra 9): `verbaVariavel − gastoRealizado`.
 * Extraída como função pura para ser reaproveitada tanto pelo fechamento de
 * ciclo (SPEC 7.2) quanto pela edição retroativa de transações de ciclo
 * fechado (SPEC regra 9) — nenhuma das duas pode reimplementar a fórmula.
 */
import type { DataCivil } from '@/shared/data';
import type { TransacaoCalc } from './tipos';
import { gastoRealizadoCents } from './teto';

export interface EntradaSobraCiclo {
  verbaVariavelCents: number;
  dataFimCiclo: DataCivil;
  transacoes: readonly TransacaoCalc[];
}

export interface ResultadoSobraCiclo {
  gastoRealizadoCents: number;
  sobraCents: number; // pode ser negativo (déficit)
}

export function sobraCiclo(entrada: EntradaSobraCiclo): ResultadoSobraCiclo {
  const gasto = gastoRealizadoCents(entrada.transacoes, entrada.dataFimCiclo);
  return { gastoRealizadoCents: gasto, sobraCents: entrada.verbaVariavelCents - gasto };
}
