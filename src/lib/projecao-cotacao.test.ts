import { describe, expect, it } from 'vitest';
import { lerCotacao } from './projecao-cotacao';

describe('lerCotacao', () => {
  it('aceita ponto e vírgula', () => {
    expect(lerCotacao('5.43')).toBe(5_430_000);
    expect(lerCotacao('5,43')).toBe(5_430_000);
  });
  it('clampa em [4,80; 6,50]', () => {
    expect(lerCotacao('9')).toBe(6_500_000);
    expect(lerCotacao('1')).toBe(4_800_000);
  });
  it('inválido ou ausente -> null', () => {
    expect(lerCotacao('abc')).toBeNull();
    expect(lerCotacao(undefined)).toBeNull();
    expect(lerCotacao('')).toBeNull();
  });
});
