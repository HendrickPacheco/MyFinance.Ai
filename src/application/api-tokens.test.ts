/**
 * Teste de `calcularExpiraEmFimDoDia` — a única conversão nova neste arquivo
 * (o resto já é coberto indiretamente pelos casos de uso de token). Pura,
 * sem Deps/fakes: só prova que "expira em YYYY-MM-DD" vira o último instante
 * daquele dia CIVIL no timezone dado, não em UTC.
 */
import { describe, expect, it } from 'vitest';
import { calcularExpiraEmFimDoDia } from './api-tokens';

describe('calcularExpiraEmFimDoDia', () => {
  it('fim do dia em America/Bahia (UTC-3) cai às 02:59:59.999 UTC do dia seguinte', () => {
    const resultado = calcularExpiraEmFimDoDia('2026-12-31', 'America/Bahia');
    expect(resultado.toISOString()).toBe('2027-01-01T02:59:59.999Z');
  });

  it('fim do dia em UTC cai no mesmo dia civil', () => {
    const resultado = calcularExpiraEmFimDoDia('2026-01-15', 'UTC');
    expect(resultado.toISOString()).toBe('2026-01-15T23:59:59.999Z');
  });

  it('data civil malformada lança (defesa de `assertData`)', () => {
    expect(() => calcularExpiraEmFimDoDia('31/12/2026', 'UTC')).toThrow(TypeError);
  });
});
