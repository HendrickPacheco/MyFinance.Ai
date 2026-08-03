import { describe, it, expect } from 'vitest';
import {
  dataVencimentoNoCiclo,
  fixoVencido,
  resumoPagamentosCents,
  VencimentoForaDoCicloError,
} from './pagamentos';

describe('dataVencimentoNoCiclo', () => {
  it('vencimento no mês de início do ciclo', () => {
    // Ciclo 05/jul a 04/ago (corte dia 5); vencimento dia 10 cai em julho.
    expect(dataVencimentoNoCiclo('2026-07-05', '2026-08-04', 10)).toBe('2026-07-10');
  });

  it('vencimento no mês seguinte, quando o ciclo cruza a virada do mês', () => {
    // Vencimento dia 2 (< corte 5) só existe no mês seguinte dentro do ciclo.
    expect(dataVencimentoNoCiclo('2026-07-05', '2026-08-04', 2)).toBe('2026-08-02');
  });

  it('dia 31 clampado para o último dia num mês de 30 dias', () => {
    // Ciclo cobre parte de setembro (30 dias); dia 31 clampa para 30/09.
    expect(dataVencimentoNoCiclo('2026-09-05', '2026-10-04', 31)).toBe('2026-09-30');
  });

  it('dia 31 clampado em fevereiro (28 dias, não bissexto)', () => {
    expect(dataVencimentoNoCiclo('2026-01-31', '2026-02-27', 31)).toBe('2026-01-31');
    // O ciclo começa exatamente no dia clampado (28/fev) — cai no mês de início.
    expect(dataVencimentoNoCiclo('2026-02-28', '2026-03-30', 31)).toBe('2026-02-28');
  });

  it('ciclo com corte no dia 1 (== mês calendário)', () => {
    expect(dataVencimentoNoCiclo('2026-07-01', '2026-07-31', 15)).toBe('2026-07-15');
  });

  it('lança quando o dia de vencimento não cabe no ciclo informado', () => {
    // Ciclo malformado de propósito: intervalo menor que 1 dia útil de folga
    // para o dia 20 aparecer nem no mês de início nem no seguinte.
    expect(() => dataVencimentoNoCiclo('2026-07-05', '2026-07-06', 20)).toThrow(
      VencimentoForaDoCicloError,
    );
  });

  it('rejeita diaVencimento fora de 1..31', () => {
    expect(() => dataVencimentoNoCiclo('2026-07-05', '2026-08-04', 0)).toThrow(RangeError);
    expect(() => dataVencimentoNoCiclo('2026-07-05', '2026-08-04', 32)).toThrow(RangeError);
  });
});

describe('fixoVencido', () => {
  const cicloInicio = '2026-07-05';
  const cicloFim = '2026-08-04';

  it('não é vencido exatamente no dia do vencimento', () => {
    expect(
      fixoVencido({ hoje: '2026-07-10', cicloInicio, cicloFim, diaVencimento: 10, pago: false }),
    ).toBe(false);
  });

  it('é vencido no dia seguinte ao vencimento, sem pagamento', () => {
    expect(
      fixoVencido({ hoje: '2026-07-11', cicloInicio, cicloFim, diaVencimento: 10, pago: false }),
    ).toBe(true);
  });

  it('não é vencido antes do vencimento', () => {
    expect(
      fixoVencido({ hoje: '2026-07-09', cicloInicio, cicloFim, diaVencimento: 10, pago: false }),
    ).toBe(false);
  });

  it('nunca é vencido se já está pago, mesmo com vencimento no passado', () => {
    expect(
      fixoVencido({ hoje: '2026-07-20', cicloInicio, cicloFim, diaVencimento: 10, pago: true }),
    ).toBe(false);
  });

  it('vencimento no mês seguinte do ciclo (cruza a virada do mês)', () => {
    expect(
      fixoVencido({ hoje: '2026-08-01', cicloInicio, cicloFim, diaVencimento: 2, pago: false }),
    ).toBe(false);
    expect(
      fixoVencido({ hoje: '2026-08-03', cicloInicio, cicloFim, diaVencimento: 2, pago: false }),
    ).toBe(true);
  });
});

describe('resumoPagamentosCents', () => {
  it('ciclo sem fixos e sem parcelas devolve zeros', () => {
    expect(resumoPagamentosCents([], [])).toEqual({ faltaPagarCents: 0, jaPagueiCents: 0 });
  });

  it('soma fixos e parcelas pagos e não pagos separadamente', () => {
    const fixos = [
      { valorCents: 200_000, pago: true }, // aluguel pago
      { valorCents: 15_000, pago: false }, // internet em aberto
    ];
    const parcelas = [
      { valorCents: 30_000, pago: false },
      { valorCents: 30_000, pago: true },
    ];

    expect(resumoPagamentosCents(fixos, parcelas)).toEqual({
      faltaPagarCents: 15_000 + 30_000,
      jaPagueiCents: 200_000 + 30_000,
    });
  });

  it('tudo pago não deixa nada em falta', () => {
    const fixos = [{ valorCents: 50_000, pago: true }];
    const parcelas = [{ valorCents: 10_000, pago: true }];
    expect(resumoPagamentosCents(fixos, parcelas)).toEqual({
      faltaPagarCents: 0,
      jaPagueiCents: 60_000,
    });
  });
});
