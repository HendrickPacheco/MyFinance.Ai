import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/shared/dinheiro';
import {
  consumirVerbas, dividirVerba, explicarPiso, projetarDiaADiaDiarioCents, tipoVerbaEfetivo,
  type TransacaoVerba,
} from './verbas';

const base = { verbaVariavelCents: 2_511_600, poupancaAlvoCents: 1_800_000, pisoDiarioCents: 15_000, diasCiclo: 30 };
const div = dividirVerba(base);
const tx = (o: Partial<TransacaoVerba>): TransacaoVerba => ({
  data: '2026-11-10', valorCents: 439_388, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', provisaoId: null, tipoVerba: 'EXTRA', ...o,
});
const consumo = (transacoes: TransacaoVerba[]) =>
  consumirVerbas({ divisao: div, transacoes, hoje: '2026-11-11', dataFimCiclo: '2026-11-30' });

describe('tipoVerbaEfetivo', () => {
  it('parcela sempre EXTRA; senão override ?? categoria ?? EXTRA', () => {
    expect(tipoVerbaEfetivo({ tipoVerbaOverride: 'DIA_A_DIA', tipoVerbaCategoria: 'DIA_A_DIA', parcelamentoId: 'p1' })).toBe('EXTRA');
    expect(tipoVerbaEfetivo({ tipoVerbaOverride: null, tipoVerbaCategoria: null, parcelamentoId: null })).toBe('EXTRA');
    expect(tipoVerbaEfetivo({ tipoVerbaOverride: 'EXTRA', tipoVerbaCategoria: 'DIA_A_DIA', parcelamentoId: null })).toBe('EXTRA');
  });
});

describe('dividirVerba', () => {
  it('casos', () => {
    expect(div).toEqual({ gastavelCents: 711_600, diaADiaCents: 450_000, extrasCents: 261_600, faltaParaPisoCents: 0 });
    expect(dividirVerba({ ...base, verbaVariavelCents: 3_125_500 })).toEqual({ gastavelCents: 1_325_500, diaADiaCents: 450_000, extrasCents: 875_500, faltaParaPisoCents: 0 });
    expect(dividirVerba({ ...base, poupancaAlvoCents: 2_200_000 })).toEqual({ gastavelCents: 311_600, diaADiaCents: 311_600, extrasCents: 0, faltaParaPisoCents: 138_400 });
    expect(dividirVerba({ ...base, poupancaAlvoCents: 3_000_000 })).toEqual({ gastavelCents: -488_400, diaADiaCents: 0, extrasCents: -488_400, faltaParaPisoCents: 450_000 });
  });
});

describe('consumirVerbas', () => {
  it('parcela EXTRA estoura extras e corrói dia a dia', () => {
    const c = consumo([tx({})]);
    expect(c.extrasRestanteCents).toBe(-177_788);
    expect(c.excedenteExtrasCents).toBe(177_788);
    expect(c.diaADiaEfetivoCents).toBe(272_212);
  });
  it('parcela futura já conta', () => {
    const c = consumo([tx({ data: '2026-11-25' })]);
    expect(c.excedenteExtrasCents).toBe(177_788);
    expect(c.diaADiaEfetivoCents).toBe(272_212);
  });
  it('teto dia a dia', () => {
    const c = consumo([tx({ data: '2026-11-05', valorCents: 100_000, tipoVerba: 'DIA_A_DIA' })]);
    expect(c.tetoDiaADia.diasRestantes).toBe(20);
    expect(c.tetoDiaADia.tetoHojeCents).toBe(17_500);
  });
  it('estorno abate', () => {
    expect(consumo([tx({ valorCents: 439_388 }), tx({ tipo: 'ESTORNO', valorCents: 39_388 })]).extrasUsadoCents).toBe(400_000);
  });
  it('ignora sem categoria e provisão', () => {
    expect(consumo([tx({ grupoCategoria: null }), tx({ provisaoId: 'x' })]).extrasUsadoCents).toBe(0);
  });
});

it('projetarDiaADiaDiarioCents', () => {
  expect(projetarDiaADiaDiarioCents(div, 439_388, 30)).toBe(9_073);
  expect(projetarDiaADiaDiarioCents(div, 0, 30)).toBe(15_000);
});

describe('explicarPiso', () => {
  const p = { ...base, parcelasCents: 439_388, rendaPrevistaCents: 3_000_000, rendaRealLiquidaCents: null };
  it('explica', () => {
    const e = explicarPiso(p)!;
    expect(e.faltaCents).toBe(177_788);
    expect(e.causas).toEqual([{ causa: 'META', cents: 1_800_000 }, { causa: 'PARCELAS', cents: 439_388 }]);
    expect(e.texto).toContain(formatBRL(177_788));
    expect(e.texto).toContain(formatBRL(15_000));
  });
  it('null sem parcelas', () => expect(explicarPiso({ ...p, parcelasCents: 0 })).toBeNull());
  it('renda menor', () =>
    expect(explicarPiso({ ...p, rendaRealLiquidaCents: 2_800_000 })!.causas).toContainEqual({ causa: 'RENDA_MENOR', cents: 200_000 }));
});
