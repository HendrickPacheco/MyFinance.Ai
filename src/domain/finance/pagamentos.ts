/**
 * Rastreamento de pagamento (coluna "Pago?" da planilha do usuário) — SPEC
 * "não faça" regra 5: nunca mistura custo fixo/provisão com verba variável.
 *
 * Regra de ouro deste módulo: é RASTREAMENTO, NUNCA RECÁLCULO. Os custos
 * fixos já foram descontados da verba quando o ciclo nasceu (congelados em
 * `Ciclo.fixosCents`) e as parcelas já são `Transacao` que consomem verba —
 * nenhuma função aqui toca `verbaVariavelCents`, `saldoDisponivelCents`,
 * `tetoHojeCents` ou `gastoRealizadoCents`. Elas só somam o que falta/já foi
 * pago e decidem se um fixo está vencido, para exibição.
 */
import { assertData, estaNoIntervalo, ultimoDiaDoMes, type DataCivil } from '@/shared/data';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data civil com o dia clampado ao último dia existente do mês (ex.: 31 -> 28/fev). */
function dataComDiaClampado(ano: number, mes1a12: number, dia: number): DataCivil {
  const diaClampado = Math.min(dia, ultimoDiaDoMes(ano, mes1a12));
  return `${ano}-${pad2(mes1a12)}-${pad2(diaClampado)}`;
}

function proximoMes(ano: number, mes1a12: number): { ano: number; mes: number } {
  return mes1a12 === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes1a12 + 1 };
}

/**
 * Lançado quando um `diaVencimento` válido (1-31) não cai em nenhum dia do
 * ciclo informado — sinal de ciclo malformado (deveria cobrir ~1 mês), nunca
 * esperado com os ciclos que `limitesCiclo` produz.
 */
export class VencimentoForaDoCicloError extends Error {
  constructor(cicloInicio: DataCivil, cicloFim: DataCivil, diaVencimento: number) {
    super(
      `dia de vencimento ${diaVencimento} não cai dentro do ciclo ${cicloInicio}..${cicloFim}`,
    );
    this.name = 'VencimentoForaDoCicloError';
  }
}

/**
 * Resolve em que data civil, dentro do ciclo [cicloInicio, cicloFim], cai um
 * `diaVencimento` (1-31). Um ciclo cobre ~1 mês e pode cruzar a virada do
 * mês civil (ex.: corte no dia 5: ciclo 05/jul a 04/ago) — por isso o
 * vencimento pode cair no mês de início OU no mês seguinte do ciclo.
 * `diaVencimento` 31 num mês de 30 dias (ou fevereiro) é clampado ao último
 * dia existente, igual ao corte de `limitesCiclo` (SPEC 5.3).
 */
export function dataVencimentoNoCiclo(
  cicloInicio: DataCivil,
  cicloFim: DataCivil,
  diaVencimento: number,
): DataCivil {
  assertData(cicloInicio, 'cicloInicio');
  assertData(cicloFim, 'cicloFim');
  if (!Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
    throw new RangeError(`diaVencimento inválido: ${diaVencimento}`);
  }

  const anoInicio = Number(cicloInicio.slice(0, 4));
  const mesInicio = Number(cicloInicio.slice(5, 7));

  const candidatoMesInicio = dataComDiaClampado(anoInicio, mesInicio, diaVencimento);
  if (estaNoIntervalo(candidatoMesInicio, cicloInicio, cicloFim)) {
    return candidatoMesInicio;
  }

  const seguinte = proximoMes(anoInicio, mesInicio);
  const candidatoMesSeguinte = dataComDiaClampado(seguinte.ano, seguinte.mes, diaVencimento);
  if (estaNoIntervalo(candidatoMesSeguinte, cicloInicio, cicloFim)) {
    return candidatoMesSeguinte;
  }

  throw new VencimentoForaDoCicloError(cicloInicio, cicloFim, diaVencimento);
}

export interface ParametrosFixoVencido {
  hoje: DataCivil;
  cicloInicio: DataCivil;
  cicloFim: DataCivil;
  diaVencimento: number;
  pago: boolean;
}

/**
 * Um custo fixo está vencido quando seu vencimento (dentro do ciclo corrente)
 * já passou e ele continua sem pagamento marcado. No dia exato do
 * vencimento ainda NÃO é vencido — só no dia seguinte. Comparação
 * lexicográfica de string "YYYY-MM-DD" (SPEC 5.1), nunca `new Date`.
 */
export function fixoVencido(params: ParametrosFixoVencido): boolean {
  if (params.pago) return false;
  const vencimento = dataVencimentoNoCiclo(
    params.cicloInicio,
    params.cicloFim,
    params.diaVencimento,
  );
  return params.hoje > vencimento;
}

export interface CompromissoPagamento {
  valorCents: number;
  pago: boolean;
}

export interface ResumoPagamentos {
  faltaPagarCents: number;
  jaPagueiCents: number;
}

/**
 * Soma o que falta pagar e o que já foi pago no mês, juntando fixos e
 * parcelas num único total (rótulo "Total de gastos" da planilha). Puramente
 * aditivo — nenhuma das duas somas jamais entra no cálculo do teto/verba.
 */
export function resumoPagamentosCents(
  fixos: readonly CompromissoPagamento[],
  parcelas: readonly CompromissoPagamento[],
): ResumoPagamentos {
  let faltaPagarCents = 0;
  let jaPagueiCents = 0;

  for (const compromisso of [...fixos, ...parcelas]) {
    if (compromisso.pago) {
      jaPagueiCents += compromisso.valorCents;
    } else {
      faltaPagarCents += compromisso.valorCents;
    }
  }

  return { faltaPagarCents, jaPagueiCents };
}
