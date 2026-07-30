import { describe, it, expect } from 'vitest';
import { avaliarRecuperacao } from './recuperacao';

describe('avaliarRecuperacao (SPEC 5.4)', () => {
  it('fora de recuperação quando o saldo é positivo', () => {
    const r = avaliarRecuperacao({ saldoDisponivelCents: 50000, diasRestantes: 10 });
    expect(r.emRecuperacao).toBe(false);
    expect(r.deficitCents).toBe(0);
    expect(r.puxarDaReserva.valorCents).toBe(0);
  });

  it('saldo negativo -> déficit em módulo e duas saídas com números, sem teto negativo', () => {
    const r = avaliarRecuperacao({ saldoDisponivelCents: -12000, diasRestantes: 8 });
    expect(r.emRecuperacao).toBe(true);
    expect(r.deficitCents).toBe(12000); // módulo do saldo
    // saída (a): gasto zero pelos dias restantes
    expect(r.gastoZero.diasSemGastar).toBe(8);
    // saída (b): puxar o déficit da reserva
    expect(r.puxarDaReserva.valorCents).toBe(12000);
  });

  it('saldo exatamente zero também entra em recuperação (déficit 0)', () => {
    const r = avaliarRecuperacao({ saldoDisponivelCents: 0, diasRestantes: 5 });
    expect(r.emRecuperacao).toBe(true);
    expect(r.deficitCents).toBe(0);
  });
});
