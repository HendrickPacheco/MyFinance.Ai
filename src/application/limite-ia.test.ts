import { describe, expect, it } from 'vitest';
import { avaliarLimiteIA, LIMITES_IA_PADRAO } from './limite-ia';
import type { UsoIADia } from '@/domain/ports/uso-ia';

const ZERO: UsoIADia = { requisicoes: 0, tokensEntrada: 0, tokensSaida: 0 };

describe('avaliarLimiteIA', () => {
  it('permite quando não houve uso no dia', () => {
    expect(avaliarLimiteIA(ZERO)).toEqual({ permitido: true });
  });

  it('permite logo abaixo do teto de requisições', () => {
    const uso = { ...ZERO, requisicoes: LIMITES_IA_PADRAO.requisicoesPorDia - 1 };
    expect(avaliarLimiteIA(uso).permitido).toBe(true);
  });

  it('bloqueia AO atingir o teto de requisições (não só ao passar)', () => {
    const uso = { ...ZERO, requisicoes: LIMITES_IA_PADRAO.requisicoesPorDia };
    const v = avaliarLimiteIA(uso);
    expect(v.permitido).toBe(false);
    expect(v).toHaveProperty('motivo');
  });

  it('bloqueia pelo teto de tokens somando entrada e saída', () => {
    const metade = LIMITES_IA_PADRAO.tokensPorDia / 2;
    const uso = { requisicoes: 1, tokensEntrada: metade, tokensSaida: metade };
    expect(avaliarLimiteIA(uso).permitido).toBe(false);
  });

  it('não bloqueia por tokens quando só a entrada está alta mas a soma não fechou', () => {
    const uso = { requisicoes: 1, tokensEntrada: LIMITES_IA_PADRAO.tokensPorDia - 10, tokensSaida: 5 };
    expect(avaliarLimiteIA(uso).permitido).toBe(true);
  });

  it('aceita limites customizados', () => {
    const uso = { ...ZERO, requisicoes: 3 };
    expect(avaliarLimiteIA(uso, { requisicoesPorDia: 3, tokensPorDia: 1e9 }).permitido).toBe(false);
    expect(avaliarLimiteIA(uso, { requisicoesPorDia: 4, tokensPorDia: 1e9 }).permitido).toBe(true);
  });

  it('dá uma mensagem factual, sem número interno de cota', () => {
    const uso = { ...ZERO, requisicoes: LIMITES_IA_PADRAO.requisicoesPorDia };
    const v = avaliarLimiteIA(uso);
    if (v.permitido) throw new Error('deveria ter bloqueado');
    expect(v.motivo).toMatch(/[Ll]imite diário/);
    expect(v.motivo).not.toMatch(/\d/); // sem vazar a cota exata
  });
});
