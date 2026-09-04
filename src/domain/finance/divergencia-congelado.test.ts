import { describe, expect, it } from 'vitest';
import { divergenciaCongelado } from './divergencia-congelado';

describe('divergenciaCongelado', () => {
  it('devolve motivoDiferenca null quando o cadastro de hoje bate com o congelado', () => {
    const resultado = divergenciaCongelado(560_00, 560_00, 'CUSTO_FIXO');

    expect(resultado.diferencaCents).toBe(0);
    expect(resultado.motivoDiferenca).toBeNull();
  });

  it('custo fixo criado no meio do ciclo: cadastro maior que o congelado', () => {
    const resultado = divergenciaCongelado(5_605_00, 7_005_00, 'CUSTO_FIXO');

    expect(resultado.diferencaCents).toBe(1_400_00);
    expect(resultado.motivoDiferenca).toContain('CONGELADO');
    expect(resultado.motivoDiferenca).toContain('custo fixo');
  });

  it('custo fixo desativado no meio do ciclo: cadastro menor que o congelado', () => {
    const resultado = divergenciaCongelado(7_005_00, 5_605_00, 'CUSTO_FIXO');

    expect(resultado.diferencaCents).toBe(-1_400_00);
    expect(resultado.motivoDiferenca).toContain('CONGELADO');
  });

  it('provisão diverge com um motivo diferente do de custo fixo', () => {
    const resultado = divergenciaCongelado(100_00, 250_00, 'PROVISAO');

    expect(resultado.diferencaCents).toBe(150_00);
    expect(resultado.motivoDiferenca).toContain('CONGELADO');
    expect(resultado.motivoDiferenca).toContain('provisão');
    expect(resultado.motivoDiferenca).not.toContain('custo fixo');
  });
});
