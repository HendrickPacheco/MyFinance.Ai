import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/shared/dinheiro';
import {
  consumirVerbas, dividirVerba, explicarPiso, projetarDiaADiaDiarioCents, ritmoDiaADiaOk, somaParcelasCents, statusDiaADia, tipoVerbaEfetivo,
  type TransacaoVerba,
} from './verbas';

const base = { verbaVariavelCents: 2_511_600, parcelasCents: 0, poupancaAlvoCents: 1_800_000, pisoDiarioCents: 15_000, diasCiclo: 30 };
const div = dividirVerba(base);
const tx = (o: Partial<TransacaoVerba>): TransacaoVerba => ({
  data: '2026-11-10', valorCents: 439_388, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', provisaoId: null, parcelamentoId: null, tipoVerba: 'EXTRA', ...o,
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
    expect(div).toEqual({ verbaLivreCents: 2_511_600, gastavelCents: 711_600, diaADiaCents: 450_000, extrasCents: 261_600, faltaParaPisoCents: 0 });
    expect(dividirVerba({ ...base, verbaVariavelCents: 3_125_500 })).toEqual({ verbaLivreCents: 3_125_500, gastavelCents: 1_325_500, diaADiaCents: 450_000, extrasCents: 875_500, faltaParaPisoCents: 0 });
    expect(dividirVerba({ ...base, poupancaAlvoCents: 2_200_000 })).toEqual({ verbaLivreCents: 2_511_600, gastavelCents: 311_600, diaADiaCents: 311_600, extrasCents: 0, faltaParaPisoCents: 138_400 });
    expect(dividirVerba({ ...base, poupancaAlvoCents: 3_000_000 })).toEqual({ verbaLivreCents: 2_511_600, gastavelCents: -488_400, diaADiaCents: 0, extrasCents: -488_400, faltaParaPisoCents: 450_000 });
  });
});

describe('consumirVerbas', () => {
  it('parcela não consome verba (já está em verbaLivre)', () => {
    const c = consumo([tx({ parcelamentoId: 'p1', valorCents: 399_294 }), tx({ parcelamentoId: 'p1', data: '2026-11-25' })]);
    expect(c.extrasUsadoCents).toBe(0);
    expect(c.diaADiaUsadoCents).toBe(0);
    expect(c.diaADiaEfetivoCents).toBe(450_000);
  });
  it('extra gasto além dos extras não corrói o dia a dia', () => {
    const c = consumo([tx({})]);
    expect(c.extrasRestanteCents).toBe(-177_788);
    expect(c.excedenteExtrasCents).toBe(177_788);
    expect(c.diaADiaEfetivoCents).toBe(450_000);
    expect(c.diaADiaRestanteCents).toBe(450_000);
  });
  it('teto dia a dia', () => {
    const c = consumo([tx({ data: '2026-11-05', valorCents: 100_000, tipoVerba: 'DIA_A_DIA' })]);
    expect(c.tetoDiaADia.diasRestantes).toBe(20);
    expect(c.tetoDiaADia.tetoHojeCents).toBe(17_500);
  });
  it('gasto EXTRA de hoje não entra no "Posso gastar hoje" do dia a dia', () => {
    const c = consumo([
      tx({ data: '2026-11-11', valorCents: 50_000, tipoVerba: 'EXTRA' }),
      tx({ data: '2026-11-11', valorCents: 3_000, tipoVerba: 'DIA_A_DIA' }),
    ]);
    expect(c.tetoDiaADia.gastoHojeCents).toBe(3_000);
    expect(c.diaADiaUsadoCents).toBe(3_000);
    expect(c.extrasUsadoCents).toBe(50_000);
  });
  it('podeGastarHojeCents = resto de hoje do dia a dia, nunca negativo', () => {
    expect(consumo([tx({ data: '2026-11-11', valorCents: 3_000, tipoVerba: 'DIA_A_DIA' })]).podeGastarHojeCents).toBe(
      consumo([tx({ data: '2026-11-11', valorCents: 3_000, tipoVerba: 'DIA_A_DIA' })]).tetoDiaADia.restaHojeCents,
    );
    const estourado = consumo([tx({ data: '2026-11-11', valorCents: 900_000, tipoVerba: 'DIA_A_DIA' })]);
    expect(estourado.tetoDiaADia.restaHojeCents).toBeLessThan(0);
    expect(estourado.podeGastarHojeCents).toBe(0);
    expect(estourado.excedidoHojeCents).toBe(-estourado.tetoDiaADia.restaHojeCents);
    expect(consumo([]).excedidoHojeCents).toBe(0);
  });
  it('estorno abate', () => {
    expect(consumo([tx({ valorCents: 439_388 }), tx({ tipo: 'ESTORNO', valorCents: 39_388 })]).extrasUsadoCents).toBe(400_000);
  });
  it('ignora sem categoria e provisão', () => {
    expect(consumo([tx({ grupoCategoria: null }), tx({ provisaoId: 'x' })]).extrasUsadoCents).toBe(0);
  });
});

it('projetarDiaADiaDiarioCents', () => {
  expect(projetarDiaADiaDiarioCents(div, 30)).toBe(15_000);
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

describe('ritmoDiaADiaOk', () => {
  const r = { totalCents: 45_000, diasTotais: 30, diasRestantes: 27 }; // dia 4: fatia = 6.000
  it('ok até a fatia proporcional dos dias vividos, acima dela não', () => {
    expect(ritmoDiaADiaOk({ ...r, usadoCents: 6_000 })).toBe(true);
    expect(ritmoDiaADiaOk({ ...r, usadoCents: 6_001 })).toBe(false);
  });
  it('dia a dia zerado/negativo só está ok sem gasto; ciclo sem dias nunca', () => {
    expect(ritmoDiaADiaOk({ ...r, totalCents: -10, usadoCents: 0 })).toBe(true);
    expect(ritmoDiaADiaOk({ ...r, totalCents: 0, usadoCents: 1 })).toBe(false);
    expect(ritmoDiaADiaOk({ ...r, diasTotais: 0, usadoCents: 0 })).toBe(false);
  });
});

describe('Task 1 - parcelas fora do dia a dia', () => {
  const prod = { verbaVariavelCents: 2_737_200, parcelasCents: 399_294, poupancaAlvoCents: 1_800_000, pisoDiarioCents: 8_333, diasCiclo: 30 };
  const fim = { hoje: '2026-11-05', dataFimCiclo: '2026-11-30' };
  it('split com parcelas', () => {
    expect(dividirVerba(prod)).toEqual({ verbaLivreCents: 2_337_906, gastavelCents: 537_906, diaADiaCents: 249_990, extrasCents: 287_916, faltaParaPisoCents: 0 });
  });
  it('split com piso mensal exato', () => {
    const d = dividirVerba({ ...prod, pisoDiarioCents: 10_000, diasCiclo: 25 });
    expect([d.gastavelCents, d.diaADiaCents, d.extrasCents]).toEqual([537_906, 250_000, 287_906]);
  });
  it('hero dia 5 de 30', () => {
    const divisao = { ...dividirVerba(prod), diaADiaCents: 250_000 };
    expect(consumirVerbas({ divisao, transacoes: [], ...fim }).podeGastarHojeCents).toBe(9_615);
  });
  it('gasto dia a dia acima do balde: hero 0 e come extras', () => {
    const divisao = { ...dividirVerba(prod), diaADiaCents: 250_000 };
    const c = consumirVerbas({ divisao, transacoes: [tx({ data: '2026-11-02', valorCents: 300_000, tipoVerba: 'DIA_A_DIA' })], ...fim });
    expect(c.podeGastarHojeCents).toBe(0);
    expect(c.extrasRestanteCents).toBe(divisao.extrasCents - 50_000);
    expect(statusDiaADia({ ...c, diasTotais: 30, diasRestantes: 26 })).toBe('ESTOURADO_USANDO_EXTRAS');
  });
  it('regressão -17.620,94: verba bugada vira SEM_VERBA_PARA_META', () => {
    const bug = dividirVerba({ ...prod, verbaVariavelCents: 437_200 });
    expect([bug.gastavelCents, bug.diaADiaCents]).toEqual([-1_762_094, 0]);
    const c = consumirVerbas({ divisao: bug, transacoes: [], ...fim });
    expect(statusDiaADia({ ...c, diasTotais: 30, diasRestantes: 26 })).toBe('SEM_VERBA_PARA_META');
    const ok = consumirVerbas({ divisao: dividirVerba(prod), transacoes: [tx({ parcelamentoId: 'p', valorCents: 399_294 })], ...fim });
    expect(ok.extrasRestanteCents).not.toBe(-1_762_094);
    expect(ok.extrasRestanteCents).toBe(287_916);
  });
  it('status ritmo', () => {
    const r = { diaADiaCents: 30_000, extrasRestanteCents: 0, gastavelCents: 30_000, diasTotais: 30, diasRestantes: 21 };
    expect(statusDiaADia({ ...r, diaADiaUsadoCents: 3_000 })).toBe('RITMO_OK');
    expect(statusDiaADia({ ...r, diaADiaUsadoCents: 20_000 })).toBe('ACIMA_DO_RITMO');
  });
});

describe("somaParcelasCents", () => {
  it("soma só DESPESA com parcelamentoId", () => {
    const t = (tipo: string, valorCents: number, parcelamentoId: string | null) => ({ tipo, valorCents, parcelamentoId });
    expect(somaParcelasCents([t("DESPESA", 100, "p"), t("DESPESA", 50, null), t("RECEITA", 70, "p"), t("DESPESA", 25, "q")])).toBe(125);
  });
});
