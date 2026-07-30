/**
 * Kernel de datas civis. TODA data civil no app é uma String "YYYY-MM-DD"
 * (SPEC 5.1). Este módulo é o único lugar que faz aritmética/comparação de
 * datas, e ele NUNCA usa `new Date("2026-07-29")` para comparar dias —
 * essa construção é interpretada como UTC e, no fuso do Brasil, retrocede
 * um dia (o bug clássico que joga um gasto de 23h para o dia errado).
 *
 * Regras:
 *  - Comparação: lexicográfica de string ("2026-07-29" < "2026-08-01").
 *  - Aritmética: date-fns via parseISO + format, sempre normalizando de volta pra string.
 *  - "Hoje": função única `hoje(tz)` que respeita o timezone da Config.
 */
import { parseISO, format, addDays, addMonths, differenceInCalendarDays } from 'date-fns';

/** String de data civil no formato "YYYY-MM-DD". */
export type DataCivil = string;

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Valida (e devolve) uma data civil bem formada. */
export function assertData(data: string, rotulo = 'data'): DataCivil {
  if (!RE_DATA.test(data)) {
    throw new TypeError(`${rotulo} precisa estar em YYYY-MM-DD, recebido: "${data}"`);
  }
  return data;
}

/** Converte string civil -> Date (meia-noite LOCAL, sem deslocamento de fuso). */
export function parseData(data: DataCivil): Date {
  assertData(data);
  return parseISO(data);
}

/** Converte Date -> string civil "YYYY-MM-DD" (usa componentes locais). */
export function formatData(d: Date): DataCivil {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Traduz um instante (Date com timestamp) para a data civil no fuso informado.
 * É o coração da regressão do bug UTC: um gasto às 23h50 em America/Bahia
 * (UTC-3) cai no dia civil local, não no dia UTC. Testável com um instante fixo.
 */
export function dataCivilNoFuso(instante: Date, timezone: string): DataCivil {
  // en-CA formata como YYYY-MM-DD; timeZone garante o dia civil correto.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** "Hoje" civil, respeitando o timezone da Config. Única fonte de "agora". */
export function hoje(timezone: string): DataCivil {
  return dataCivilNoFuso(new Date(), timezone);
}

/** Soma (ou subtrai, com n negativo) dias a uma data civil. */
export function addDias(data: DataCivil, n: number): DataCivil {
  return formatData(addDays(parseData(data), n));
}

/**
 * Soma (ou subtrai) meses a uma data civil. date-fns faz o clamp para o
 * último dia quando o dia não existe (ex.: 31/jan + 1 mês -> 28/fev).
 */
export function addMeses(data: DataCivil, n: number): DataCivil {
  return formatData(addMonths(parseData(data), n));
}

/** Dia anterior. */
export function ontem(data: DataCivil): DataCivil {
  return addDias(data, -1);
}

/**
 * Diferença em dias civis: quantos dias `a` está à frente de `b`.
 * diffDias("2026-08-04", "2026-08-04") === 0
 * diffDias("2026-08-04", "2026-08-01") === 3
 */
export function diffDias(a: DataCivil, b: DataCivil): number {
  return differenceInCalendarDays(parseData(a), parseData(b));
}

/** true se `data` está dentro do intervalo fechado [inicio, fim]. */
export function estaNoIntervalo(data: DataCivil, inicio: DataCivil, fim: DataCivil): boolean {
  assertData(data);
  assertData(inicio);
  assertData(fim);
  return data >= inicio && data <= fim; // comparação lexicográfica (SPEC 5.1)
}

/** Último dia (número) de um mês 1-based. Ex.: ultimoDiaDoMes(2026, 2) === 28. */
export function ultimoDiaDoMes(ano: number, mes1a12: number): number {
  // Dia 0 do mês seguinte (índice = mes1a12 em base 0-11) = último dia do mês corrente.
  return new Date(ano, mes1a12, 0).getDate();
}
