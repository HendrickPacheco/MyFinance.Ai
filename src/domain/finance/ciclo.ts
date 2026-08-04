/**
 * Limites de ciclo financeiro (SPEC 5.3). A unidade de tempo do app é o
 * intervalo entre recebimentos, não o mês calendário.
 */
import { addDias, assertData, diffDias, ultimoDiaDoMes, type DataCivil } from '@/shared/data';
import type { LimitesCiclo } from './tipos';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data do corte do ciclo em um dado mês, com clamp para o último dia existente. */
function corteDoMes(ano: number, mes1a12: number, diaRecebimento: number): DataCivil {
  const dia = Math.min(diaRecebimento, ultimoDiaDoMes(ano, mes1a12));
  return `${ano}-${pad2(mes1a12)}-${pad2(dia)}`;
}

/** Anda `delta` meses a partir de (ano, mes 1-based), tratando virada de ano. */
function passoMes(ano: number, mes1a12: number, delta: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes1a12 - 1) + delta;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/**
 * Dado uma data civil e o dia de recebimento, devolve o intervalo fechado
 * [inicio, fim] do ciclo que contém a data.
 *
 *   limitesCiclo("2026-07-20", 5) -> { inicio: "2026-07-05", fim: "2026-08-04" }
 *
 * Se o mês não tem o dia (ex.: 31 em fevereiro), usa o último dia do mês.
 */
export function limitesCiclo(data: DataCivil, diaRecebimento: number): LimitesCiclo {
  assertData(data);
  if (!Number.isInteger(diaRecebimento) || diaRecebimento < 1 || diaRecebimento > 31) {
    throw new RangeError(`diaRecebimento inválido: ${diaRecebimento}`);
  }

  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const corteMesAtual = corteDoMes(ano, mes, diaRecebimento);

  let inicio: DataCivil;
  if (data >= corteMesAtual) {
    inicio = corteMesAtual;
  } else {
    const anterior = passoMes(ano, mes, -1);
    inicio = corteDoMes(anterior.ano, anterior.mes, diaRecebimento);
  }

  const proximo = passoMes(Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7)), 1);
  const proximoCorte = corteDoMes(proximo.ano, proximo.mes, diaRecebimento);
  const fim = addDias(proximoCorte, -1);

  return { inicio, fim };
}

/** Nº total de dias do ciclo (intervalo fechado nas duas pontas). */
export function diasTotaisCiclo(limites: LimitesCiclo): number {
  return diffDias(limites.fim, limites.inicio) + 1;
}

/**
 * O ciclo que começa no dia seguinte a `fimAnterior`, terminando no corte
 * seguinte da grade de `diaRecebimento`.
 *
 * Existe por causa da TRANSIÇÃO: se o usuário muda o `diaRecebimento` depois
 * de um ciclo já ter nascido, o dia seguinte ao fim dele pode cair no meio de
 * um ciclo da grade nova. `limitesCiclo` sozinho devolveria o intervalo
 * inteiro dessa grade — que RETROCEDE e se sobrepõe ao ciclo anterior,
 * fazendo a mesma parcela ser contada duas vezes.
 *
 *   fim anterior 2026-08-04, diaRecebimento novo 20
 *     limitesCiclo("2026-08-05", 20) -> { 2026-07-20, 2026-08-19 }  <- sobrepõe
 *     proximoCicloApos("2026-08-04", 20) -> { 2026-08-05, 2026-08-19 }
 *
 * O ciclo de transição é mais curto; a partir do seguinte a grade normaliza.
 * Sem mudança de `diaRecebimento`, é idêntico a `limitesCiclo` do dia seguinte.
 */
export function proximoCicloApos(fimAnterior: DataCivil, diaRecebimento: number): LimitesCiclo {
  const inicio = addDias(assertData(fimAnterior), 1);
  return { inicio, fim: limitesCiclo(inicio, diaRecebimento).fim };
}
