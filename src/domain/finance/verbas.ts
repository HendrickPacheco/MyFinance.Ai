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

export type TransacaoVerba = TransacaoCalc & { tipoVerba: TipoVerba };

export interface DivisaoVerba {
  gastavelCents: number;
  diaADiaCents: number;
  extrasCents: number;
  faltaParaPisoCents: number;
}

export function dividirVerba(p: {
  verbaVariavelCents: number;
  poupancaAlvoCents: number;
  pisoDiarioCents: number;
  diasCiclo: number;
}): DivisaoVerba {
  const gastavelCents = p.verbaVariavelCents - p.poupancaAlvoCents;
  const pisoTotal = p.pisoDiarioCents * p.diasCiclo;
  const diaADiaCents = Math.min(Math.max(gastavelCents, 0), pisoTotal);
  return {
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
  const elegiveis = p.transacoes.filter(contaComoVerbaVariavel);
  const extrasUsadoCents = gastoRealizadoCents(
    elegiveis.filter((t) => t.tipoVerba === 'EXTRA'),
    p.dataFimCiclo,
  );
  const { diaADiaCents, extrasCents } = p.divisao;
  const excedenteExtrasCents = Math.max(extrasUsadoCents - Math.max(extrasCents, 0), 0);
  const diaADiaEfetivoCents = diaADiaCents - excedenteExtrasCents;
  const doDia = elegiveis.filter((t) => t.tipoVerba === 'DIA_A_DIA');
  const tetoDiaADia = calcularTeto({
    verbaVariavelCents: diaADiaEfetivoCents,
    dataFimCiclo: p.dataFimCiclo,
    hoje: p.hoje,
    transacoes: doDia,
  });
  const diaADiaUsadoCents = gastoRealizadoCents(doDia, p.hoje);
  return {
    ...p.divisao,
    extrasUsadoCents,
    extrasRestanteCents: extrasCents - extrasUsadoCents,
    excedenteExtrasCents,
    diaADiaEfetivoCents,
    diaADiaUsadoCents,
    diaADiaRestanteCents: diaADiaEfetivoCents - diaADiaUsadoCents,
    tetoDiaADia,
    podeGastarHojeCents: Math.max(tetoDiaADia.restaHojeCents, 0),
    excedidoHojeCents: Math.max(-tetoDiaADia.restaHojeCents, 0),
  };
}

export function projetarDiaADiaDiarioCents(
  divisao: DivisaoVerba,
  extrasComprometidosCents: number,
  diasCiclo: number,
): number {
  const excedente = Math.max(extrasComprometidosCents - Math.max(divisao.extrasCents, 0), 0);
  return Math.floor(Math.max(divisao.diaADiaCents - excedente, 0) / diasCiclo);
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
