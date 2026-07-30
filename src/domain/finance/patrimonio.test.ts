import { describe, it, expect } from 'vitest';
import {
  totalPatrimonioCents,
  variacaoMensalCents,
  taxaAcumulacaoMediaCents,
  mesesDeReserva,
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
    // custo zero não explode em Infinity
    expect(mesesDeReserva({ saldoReservaCents: 600000, custoMensalMedioCents: 0 })).toBe(0);
  });
});
