import { describe, expect, it } from 'vitest';
import { RateLimiterMemoria } from './rate-limiter-memoria';

/** Relógio controlado: nenhum teste espera tempo real passar. */
function comRelogio() {
  let agora = 1_000_000;
  const limiter = new RateLimiterMemoria(() => agora);
  return { limiter, avancar: (ms: number) => (agora += ms) };
}

describe('RateLimiterMemoria', () => {
  it('permite até o limite e nega a partir dele', async () => {
    const { limiter } = comRelogio();
    for (let i = 0; i < 3; i += 1) {
      expect(await limiter.permitir('k', 3, 1000)).toBe(true);
    }
    expect(await limiter.permitir('k', 3, 1000)).toBe(false);
  });

  it('continua negando dentro da mesma janela', async () => {
    const { limiter, avancar } = comRelogio();
    for (let i = 0; i < 3; i += 1) await limiter.permitir('k', 3, 1000);

    avancar(999);
    expect(await limiter.permitir('k', 3, 1000)).toBe(false);
  });

  it('reabre quando a janela vira', async () => {
    const { limiter, avancar } = comRelogio();
    for (let i = 0; i < 3; i += 1) await limiter.permitir('k', 3, 1000);
    expect(await limiter.permitir('k', 3, 1000)).toBe(false);

    avancar(1000);
    expect(await limiter.permitir('k', 3, 1000)).toBe(true);
  });

  it('isola as chaves entre si', async () => {
    const { limiter } = comRelogio();
    for (let i = 0; i < 3; i += 1) await limiter.permitir('a', 3, 1000);

    expect(await limiter.permitir('a', 3, 1000)).toBe(false);
    expect(await limiter.permitir('b', 3, 1000)).toBe(true);
  });

  it('limite 0 nega desde a primeira chamada', async () => {
    const { limiter } = comRelogio();
    expect(await limiter.permitir('k', 0, 1000)).toBe(false);
  });

  it('não vaza memória: janelas vencidas são coletadas', async () => {
    const { limiter, avancar } = comRelogio();
    for (let i = 0; i < 600; i += 1) await limiter.permitir(`k${i}`, 1, 1000);

    avancar(2000);
    // A próxima janela nova dispara a coleta das 600 vencidas.
    await limiter.permitir('gatilho', 1, 1000);

    const mapa = (limiter as unknown as { janelas: Map<string, unknown> }).janelas;
    expect(mapa.size).toBeLessThan(600);
  });
});
