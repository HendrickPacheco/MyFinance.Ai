/**
 * Verbas separadas (D1): "dia a dia" e "extras" DERIVADAS da verba variável.
 * `verbaVariavelCents` não muda (D-11, D-16) — o split é só uma visão.
 */
import type { DataCivil } from '@/shared/data';
import { formatBRL } from '@/shared/dinheiro';
import type { TipoVerba } from '@/domain/model/enums';
import { calcularTeto, contaComoVerbaVariavel, gastoRealizadoCents } from './teto';
import type { ResultadoTeto, TransacaoCalc } from './tipos';

export function tipoVerbaEfetivo(t: {
  tipoVerbaOverride: TipoVerba | null;
  tipoVerbaCategoria: TipoVerba | null;
  parcelamentoId: string | null;
}): TipoVerba {
  if (t.parcelamentoId != null) return 'EXTRA';
  return t.tipoVerbaOverride ?? t.tipoVerbaCategoria ?? 'EXTRA';
}

/** `parcelamentoId` != null = parcela: já está em `verbaLivre`, não consome verba. */
export type TransacaoVerba = TransacaoCalc & { tipoVerba: TipoVerba; parcelamentoId: string | null };

/** Soma das parcelas (DESPESA com `parcelamentoId`) de um ciclo — o `parcelasCents` de `dividirVerba`. */
export function somaParcelasCents(
  transacoes: readonly { tipo: string; valorCents: number; parcelamentoId: string | null }[],
): number {
  return transacoes
    .filter((t) => t.tipo === 'DESPESA' && t.parcelamentoId != null)
    .reduce((s, t) => s + t.valorCents, 0);
}

export interface DivisaoVerba {
  /** verbaVariavel − parcelas do ciclo (D-11: parcela é separada, nunca embutida na verba). */
  verbaLivreCents: number;
  gastavelCents: number;
  diaADiaCents: number;
  extrasCents: number;
  faltaParaPisoCents: number;
}

export function dividirVerba(p: {
  verbaVariavelCents: number;
  parcelasCents: number;
  poupancaAlvoCents: number;
  pisoDiarioCents: number;
  diasCiclo: number;
}): DivisaoVerba {
  const verbaLivreCents = p.verbaVariavelCents - p.parcelasCents;
  const gastavelCents = verbaLivreCents - p.poupancaAlvoCents;
  const pisoTotal = p.pisoDiarioCents * p.diasCiclo;
  const diaADiaCents = Math.min(Math.max(gastavelCents, 0), pisoTotal);
  return {
    verbaLivreCents,
    gastavelCents,
    diaADiaCents,
    extrasCents: gastavelCents - diaADiaCents,
    faltaParaPisoCents: pisoTotal - diaADiaCents,
  };
}

export interface ConsumoVerbas extends DivisaoVerba {
  extrasUsadoCents: number;
  extrasRestanteCents: number;
  excedenteExtrasCents: number;
  diaADiaEfetivoCents: number;
  diaADiaUsadoCents: number;
  diaADiaRestanteCents: number;
  tetoDiaADia: ResultadoTeto;
  /** "Posso gastar hoje": resto de hoje do dia a dia, nunca negativo — o MESMO valor em toda tela. */
  podeGastarHojeCents: number;
  /** Quanto o gasto de hoje passou do teto do dia a dia (0 se não passou) — o que o clamp acima esconde. */
  excedidoHojeCents: number;
}

export function consumirVerbas(p: {
  divisao: DivisaoVerba;
  transacoes: readonly TransacaoVerba[];
  hoje: DataCivil;
  dataFimCiclo: DataCivil;
}): ConsumoVerbas {
  // Parcela já saiu da verba livre: não consome extras nem dia a dia.
  const elegiveis = p.transacoes.filter((t) => t.parcelamentoId == null && contaComoVerbaVariavel(t));
  const extrasUsadoCents = gastoRealizadoCents(
    elegiveis.filter((t) => t.tipoVerba === 'EXTRA'),
    p.dataFimCiclo,
  );
  const { diaADiaCents, extrasCents } = p.divisao;
  const diaADiaEfetivoCents = diaADiaCents;
  const doDia = elegiveis.filter((t) => t.tipoVerba === 'DIA_A_DIA');
  const tetoDiaADia = calcularTeto({
    verbaVariavelCents: diaADiaEfetivoCents,
    dataFimCiclo: p.dataFimCiclo,
    hoje: p.hoje,
    transacoes: doDia,
  });
  const diaADiaUsadoCents = gastoRealizadoCents(doDia, p.hoje);
  // Dia a dia que passou do balde come os extras (e não o contrário).
  const extrasRestanteCents =
    extrasCents - extrasUsadoCents - Math.max(0, diaADiaUsadoCents - diaADiaCents);
  return {
    ...p.divisao,
    extrasUsadoCents,
    extrasRestanteCents,
    excedenteExtrasCents: Math.max(0, -extrasRestanteCents),
    diaADiaEfetivoCents,
    diaADiaUsadoCents,
    diaADiaRestanteCents: Math.max(0, diaADiaCents - diaADiaUsadoCents),
    tetoDiaADia,
    podeGastarHojeCents: Math.max(tetoDiaADia.restaHojeCents, 0),
    excedidoHojeCents: Math.max(-tetoDiaADia.restaHojeCents, 0),
  };
}

export function projetarDiaADiaDiarioCents(divisao: DivisaoVerba, diasCiclo: number): number {
  return Math.floor(Math.max(divisao.diaADiaCents, 0) / diasCiclo);
}

export type StatusDiaADia =
  | 'SEM_VERBA_PARA_META'
  | 'ESTOURADO_USANDO_EXTRAS'
  | 'ACIMA_DO_RITMO'
  | 'RITMO_OK';

export function statusDiaADia(p: {
  diaADiaCents: number;
  diaADiaUsadoCents: number;
  extrasRestanteCents: number;
  gastavelCents: number;
  diasTotais: number;
  diasRestantes: number;
}): StatusDiaADia {
  if (p.gastavelCents < 0) return 'SEM_VERBA_PARA_META';
  if (p.diaADiaUsadoCents > p.diaADiaCents || p.extrasRestanteCents < 0) return 'ESTOURADO_USANDO_EXTRAS';
  return ritmoDiaADiaOk({
    usadoCents: p.diaADiaUsadoCents,
    totalCents: p.diaADiaCents,
    diasTotais: p.diasTotais,
    diasRestantes: p.diasRestantes,
  })
    ? 'RITMO_OK'
    : 'ACIMA_DO_RITMO';
}

export interface ExplicacaoPiso {
  faltaCents: number;
  necessarioCents: number;
  disponivelCents: number;
  causas: { causa: 'META' | 'PARCELAS' | 'RENDA_MENOR'; cents: number }[];
  texto: string;
}

const ROTULO = { META: 'a meta de poupança', PARCELAS: 'as parcelas', RENDA_MENOR: 'a renda real menor que a prevista' };

export function explicarPiso(p: {
  verbaVariavelCents: number;
  poupancaAlvoCents: number;
  parcelasCents: number;
  pisoDiarioCents: number;
  diasCiclo: number;
  rendaPrevistaCents: number;
  rendaRealLiquidaCents: number | null;
}): ExplicacaoPiso | null {
  const necessarioCents = p.pisoDiarioCents * p.diasCiclo;
  const disponivelCents = p.verbaVariavelCents - p.poupancaAlvoCents - p.parcelasCents;
  if (disponivelCents >= necessarioCents) return null;
  const faltaCents = necessarioCents - disponivelCents;
  const causas = (
    [
      { causa: 'META', cents: p.poupancaAlvoCents },
      { causa: 'PARCELAS', cents: p.parcelasCents },
      {
        causa: 'RENDA_MENOR',
        cents:
          p.rendaRealLiquidaCents == null
            ? 0
            : Math.max(p.rendaPrevistaCents - p.rendaRealLiquidaCents, 0),
      },
    ] as const
  )
    .filter((c) => c.cents > 0)
    .map((c) => ({ ...c }))
    .sort((a, b) => b.cents - a.cents);
  const texto =
    `Faltam ${formatBRL(faltaCents)} para o piso de ${formatBRL(p.pisoDiarioCents)}/dia ` +
    `(${formatBRL(necessarioCents)} no ciclo; sobram ${formatBRL(disponivelCents)}).` +
    (causas.length ? ` Pesam: ${causas.map((c) => ROTULO[c.causa]).join(', ')}.` : '');
  return { faltaCents, necessarioCents, disponivelCents, causas, texto };
}

/**
 * Ritmo do dia a dia: o usado até hoje cabe na fatia proporcional dos dias já
 * vividos (hoje incluso)? `diasRestantes` inclui hoje.
 */
export function ritmoDiaADiaOk(p: {
  usadoCents: number;
  totalCents: number;
  diasTotais: number;
  diasRestantes: number;
}): boolean {
  if (p.diasTotais <= 0) return false;
  const diasVividos = p.diasTotais - p.diasRestantes + 1;
  return p.usadoCents <= Math.floor((Math.max(p.totalCents, 0) * diasVividos) / p.diasTotais);
}
