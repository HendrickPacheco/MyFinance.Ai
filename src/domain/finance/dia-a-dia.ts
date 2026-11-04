/**
 * Divisão da verba em "dia a dia" (piso diário × dias) e "extras" (o resto).
 * Função pura; tudo Int em centavos. Ruling R1: o gastável desconta também as
 * parcelas do ciclo (além da meta).
 */
export interface EntradaDiaADia {
  verbaVariavelCents: number;
  poupancaAlvoCents: number;
  parcelasCicloCents: number;
  pisoDiarioVerbaCents: number;
  diasTotais: number;
  /** Inclui hoje. */
  diasRestantes: number;
  /** Gasto variável realizado SEM parcelas. */
  gastoDiaADiaCents: number;
  /** Parte de `gastoDiaADiaCents` lançada hoje (sem parcelas). */
  gastoHojeCents: number;
}

export interface DivisaoDiaADia {
  gastavelCents: number;
  diaADiaCents: number;
  extrasCents: number;
  usadoDiaADiaCents: number;
  extrasDisponivelCents: number;
  possoGastarHojeCents: number;
  ritmoOk: boolean;
}

export function divisaoDiaADia(e: EntradaDiaADia): DivisaoDiaADia {
  const gasto = e.gastoDiaADiaCents;
  const gastavelCents = Math.max(
    0,
    e.verbaVariavelCents - e.poupancaAlvoCents - e.parcelasCicloCents,
  );
  const diaADiaCents = Math.min(e.pisoDiarioVerbaCents * e.diasTotais, gastavelCents);
  const extrasCents = gastavelCents - diaADiaCents;
  const usadoExtrasCents = Math.min(extrasCents, Math.max(0, gasto - diaADiaCents));
  // Espelha o teto do motor: o dia a dia restante no início de hoje é rateado
  // pelos dias restantes; o que se gasta hoje abate o teto de hoje, não o dos outros dias.
  const gastoAntesDeHoje = gasto - e.gastoHojeCents;
  const tetoHojeCents = Math.floor(
    Math.max(0, diaADiaCents - gastoAntesDeHoje) / Math.max(1, e.diasRestantes),
  );
  const diasPassados = e.diasTotais - e.diasRestantes + 1;

  return {
    gastavelCents,
    diaADiaCents,
    extrasCents,
    usadoDiaADiaCents: Math.min(gasto, diaADiaCents),
    extrasDisponivelCents: Math.max(0, extrasCents - usadoExtrasCents),
    possoGastarHojeCents: Math.max(0, tetoHojeCents - e.gastoHojeCents),
    ritmoOk: e.diasTotais > 0 && gasto <= Math.floor((diaADiaCents * diasPassados) / e.diasTotais),
  };
}
