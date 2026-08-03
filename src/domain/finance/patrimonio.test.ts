import { describe, it, expect } from 'vitest';
import {
  totalPatrimonioCents,
  variacaoMensalCents,
  taxaAcumulacaoMediaCents,
  mesesDeReserva,
  totalPorClasseCents,
} from './patrimonio';

describe('patrimônio (SPEC 5.6)', () => {
  it('total do snapshot é a soma dos itens', () => {
    expect(totalPatrimonioCents([100000, 250000, 50000])).toBe(400000);
    expect(totalPatrimonioCents([])).toBe(0);
  });

  it('variação mensal pode ser negativa', () => {
    expect(variacaoMensalCents(400000, 350000)).toBe(50000);
    expect(variacaoMensalCents(300000, 350000)).toBe(-50000);
  });

  it('taxa de acumulação média usa a janela das últimas variações', () => {
    // Totais crescendo 100,00 por mês -> variação média 10000.
    expect(taxaAcumulacaoMediaCents([100000, 110000, 120000, 130000])).toBe(10000);
    // menos de 2 pontos -> 0
    expect(taxaAcumulacaoMediaCents([100000])).toBe(0);
  });

  it('meses de reserva = saldo / custo mensal médio', () => {
    expect(mesesDeReserva({ saldoReservaCents: 600000, custoMensalMedioCents: 200000 })).toBe(3);
  });

  it('sem histórico de custo (divisor ausente) é não calculável, não 0 fabricado', () => {
    expect(mesesDeReserva({ saldoReservaCents: 600000, custoMensalMedioCents: null })).toBeNull();
  });

  it('reserva genuinamente zerada com custo real conhecido devolve 0 de verdade', () => {
    expect(mesesDeReserva({ saldoReservaCents: 0, custoMensalMedioCents: 200000 })).toBe(0);
  });

  it('custo mensal negativo não explode: sem divisor confiável, é não calculável', () => {
    expect(mesesDeReserva({ saldoReservaCents: 600000, custoMensalMedioCents: -50000 })).toBeNull();
  });

  it('reserva negativa com custo real conhecido devolve meses negativos (sinal real, não fabricado)', () => {
    expect(mesesDeReserva({ saldoReservaCents: -100000, custoMensalMedioCents: 200000 })).toBe(-0.5);
  });

  it('total por classe soma itens da mesma classe, preservando ordem de aparição', () => {
    expect(
      totalPorClasseCents([
        { classe: 'CONTA', valorCents: 100000 },
        { classe: 'CRIPTO', valorCents: 20000 },
        { classe: 'CONTA', valorCents: 50000 },
      ]),
    ).toEqual([
      { classe: 'CONTA', totalCents: 150000 },
      { classe: 'CRIPTO', totalCents: 20000 },
    ]);
  });

  it('total por classe de lista vazia devolve lista vazia', () => {
    expect(totalPorClasseCents([])).toEqual([]);
  });
});
