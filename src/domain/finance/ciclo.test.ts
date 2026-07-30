import { describe, it, expect } from 'vitest';
import { limitesCiclo, diasTotaisCiclo } from './ciclo';

describe('limitesCiclo (SPEC 9 — dias 1, 15, 28, 31; virada de ano; fevereiro; bissexto)', () => {
  it('exemplo da SPEC: dia 5, data 2026-07-20', () => {
    expect(limitesCiclo('2026-07-20', 5)).toEqual({ inicio: '2026-07-05', fim: '2026-08-04' });
  });

  it('dia de recebimento = 1 (ciclo == mês calendário)', () => {
    expect(limitesCiclo('2026-07-15', 1)).toEqual({ inicio: '2026-07-01', fim: '2026-07-31' });
    // Exatamente no dia do corte, o ciclo começa nesse dia.
    expect(limitesCiclo('2026-07-01', 1)).toEqual({ inicio: '2026-07-01', fim: '2026-07-31' });
  });

  it('dia 15', () => {
    expect(limitesCiclo('2026-07-20', 15)).toEqual({ inicio: '2026-07-15', fim: '2026-08-14' });
    // Antes do corte do mês -> pertence ao ciclo anterior.
    expect(limitesCiclo('2026-07-10', 15)).toEqual({ inicio: '2026-06-15', fim: '2026-07-14' });
  });

  it('dia 28', () => {
    expect(limitesCiclo('2026-03-01', 28)).toEqual({ inicio: '2026-02-28', fim: '2026-03-27' });
    expect(limitesCiclo('2026-02-28', 28)).toEqual({ inicio: '2026-02-28', fim: '2026-03-27' });
  });

  it('dia 31 — clamp para o último dia nos meses curtos', () => {
    // Fevereiro não tem 31: corte cai em 28 (2026). Ciclo de janeiro:
    expect(limitesCiclo('2026-02-10', 31)).toEqual({ inicio: '2026-01-31', fim: '2026-02-27' });
    // A partir de 28/02 já é o próximo ciclo, que vai até 30/03 (março tem 31).
    expect(limitesCiclo('2026-02-28', 31)).toEqual({ inicio: '2026-02-28', fim: '2026-03-30' });
    // Abril (30) -> corte 30; maio tem 31.
    expect(limitesCiclo('2026-04-30', 31)).toEqual({ inicio: '2026-04-30', fim: '2026-05-30' });
  });

  it('fevereiro em ano bissexto (2024)', () => {
    expect(limitesCiclo('2024-02-15', 31)).toEqual({ inicio: '2024-01-31', fim: '2024-02-28' });
    expect(limitesCiclo('2024-02-29', 31)).toEqual({ inicio: '2024-02-29', fim: '2024-03-30' });
  });

  it('virada de ano (dezembro -> janeiro)', () => {
    expect(limitesCiclo('2026-12-20', 5)).toEqual({ inicio: '2026-12-05', fim: '2027-01-04' });
    // Início de janeiro antes do corte pertence ao ciclo que começou em dezembro.
    expect(limitesCiclo('2027-01-03', 5)).toEqual({ inicio: '2026-12-05', fim: '2027-01-04' });
  });

  it('rejeita diaRecebimento fora de 1..31', () => {
    expect(() => limitesCiclo('2026-07-20', 0)).toThrow();
    expect(() => limitesCiclo('2026-07-20', 32)).toThrow();
  });
});

describe('diasTotaisCiclo', () => {
  it('conta as duas pontas', () => {
    expect(diasTotaisCiclo({ inicio: '2026-07-05', fim: '2026-08-04' })).toBe(31);
    expect(diasTotaisCiclo({ inicio: '2026-01-31', fim: '2026-02-27' })).toBe(28);
    expect(diasTotaisCiclo({ inicio: '2026-07-01', fim: '2026-07-31' })).toBe(31);
  });
});
