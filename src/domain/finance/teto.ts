/**
 * Teto do dia (SPEC 5.3) — o coração do app. Recalculado a cada dia, nunca
 * fixo. Exclui o gasto de hoje para separar "o teto de hoje" de "o que resta
 * de hoje". Nunca inclui fixos nem provisão. Nunca fica negativo.
 */
import { addDias, assertData, diffDias, ontem, type DataCivil } from '@/shared/data';
import type { EntradaTeto, ResultadoTeto, TransacaoCalc } from './tipos';

/**
 * Uma transação conta como gasto de VERBA VARIÁVEL quando:
 *  - é do grupo de categoria VARIAVEL, e
 *  - NÃO é gasto de provisão (provisaoId vazio — item 3).
 * DESPESA soma; ESTORNO abate; RENDA e TRANSFERENCIA são ignorados (regras 1, 2, 8).
 */
function contaComoVerbaVariavel(t: TransacaoCalc): boolean {
  return t.grupoCategoria === 'VARIAVEL' && t.provisaoId == null;
}

/**
 * Gasto realizado, líquido, do ciclo até (inclusive) `ateData`.
 * Conta apenas DESPESA de grupo VARIAVEL, subtrai ESTORNO, ignora o resto.
 * O ESTORNO é abatido na sua própria `data` — que a camada de aplicação já
 * ajusta para a data da transação original quando ela existe (SPEC regra 5).
 */
export function gastoRealizadoCents(
  transacoes: readonly TransacaoCalc[],
  ateData: DataCivil,
): number {
  assertData(ateData);

  let total = 0;
  for (const t of transacoes) {
    if (t.data > ateData) continue; // comparação lexicográfica (SPEC 5.1)
    if (!contaComoVerbaVariavel(t)) continue;

    if (t.tipo === 'DESPESA') total += t.valorCents;
    else if (t.tipo === 'ESTORNO') total -= t.valorCents;
  }
  return total;
}

/**
 * Calcula todos os números da tela Hoje de uma vez.
 *
 *   diasRestantes   = diffDias(fim, hoje) + 1                 (inclui hoje)
 *   saldoDisponivel = verbaVariavel − gastoRealizado(ontem)   (exclui hoje)
 *   tetoHoje        = floor(max(saldo, 0) / diasRestantes)    (nunca negativo)
 *   gastoHoje       = gasto(hoje) − gasto(ontem)
 *   restaHoje       = tetoHoje − gastoHoje                    (pode ser negativo)
 */
export function calcularTeto(entrada: EntradaTeto): ResultadoTeto {
  assertData(entrada.hoje);
  assertData(entrada.dataFimCiclo);

  const ontemStr = ontem(entrada.hoje);
  const gastoAntesDeHojeCents = gastoRealizadoCents(entrada.transacoes, ontemStr);
  const gastoAteHojeCents = gastoRealizadoCents(entrada.transacoes, entrada.hoje);
  const gastoHojeCents = gastoAteHojeCents - gastoAntesDeHojeCents;

  const saldoDisponivelCents = entrada.verbaVariavelCents - gastoAntesDeHojeCents;
  const emRecuperacao = saldoDisponivelCents <= 0;

  const diasRestantes = diffDias(entrada.dataFimCiclo, entrada.hoje) + 1;

  // Fora do ciclo (hoje > fim) não há teto a distribuir.
  const tetoHojeCents =
    diasRestantes <= 0 ? 0 : Math.floor(Math.max(saldoDisponivelCents, 0) / diasRestantes);

  return {
    diasRestantes,
    gastoAntesDeHojeCents,
    saldoDisponivelCents,
    tetoHojeCents,
    gastoHojeCents,
    restaHojeCents: tetoHojeCents - gastoHojeCents,
    emRecuperacao,
  };
}

/**
 * Teto de um dia futuro `dia`, assumindo que a partir de hoje nada foi gasto
 * ainda naquele dia. Usado para provar a invariante (SPEC critério 3): a soma
 * dos tetos dos dias restantes nunca ultrapassa o saldo disponível.
 */
export function tetoDoDia(params: {
  verbaVariavelCents: number;
  dataFimCiclo: DataCivil;
  dia: DataCivil;
  transacoes: readonly TransacaoCalc[];
}): number {
  return calcularTeto({
    verbaVariavelCents: params.verbaVariavelCents,
    dataFimCiclo: params.dataFimCiclo,
    hoje: params.dia,
    transacoes: params.transacoes,
  }).tetoHojeCents;
}

/** Avança um dia (exposto por conveniência para simulações e a camada de app). */
export function proximoDia(dia: DataCivil): DataCivil {
  return addDias(dia, 1);
}
