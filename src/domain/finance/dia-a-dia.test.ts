import { describe, expect, it } from 'vitest';
import { divisaoDiaADia, type EntradaDiaADia } from './dia-a-dia';

// verba 1.000.000 − meta 300.000 − parcelas 162.100 = gastável 537.900
const base: EntradaDiaADia = {
  verbaVariavelCents: 1_000_000,
  poupancaAlvoCents: 300_000,
  parcelasCicloCents: 162_100,
  pisoDiarioVerbaCents: 8_333,
  diasTotais: 30,
  diasRestantes: 26,
  gastoDiaADiaCents: 0,
};

describe('divisaoDiaADia', () => {
  it('caso protótipo', () => {
    const r = divisaoDiaADia(base);
    expect(r.gastavelCents).toBe(537_900);
    expect(r.diaADiaCents).toBe(249_990);
    expect(r.extrasCents).toBe(287_910);
    expect(r.usadoDiaADiaCents).toBe(0);
    expect(r.extrasDisponivelCents).toBe(287_910);
    expect(r.possoGastarHojeCents).toBe(Math.floor(249_990 / 26));
    expect(r.ritmoOk).toBe(true);
  });

  it('gastável < piso × dias: extras 0', () => {
    const r = divisaoDiaADia({ ...base, parcelasCicloCents: 600_000 });
    expect(r.gastavelCents).toBe(100_000);
    expect(r.diaADiaCents).toBe(100_000);
    expect(r.extrasCents).toBe(0);
  });

  it('gasto acima do dia a dia consome extras', () => {
    const r = divisaoDiaADia({ ...base, gastoDiaADiaCents: 300_000 });
    expect(r.usadoDiaADiaCents).toBe(249_990);
    expect(r.extrasDisponivelCents).toBe(287_910 - 50_010);
    expect(r.possoGastarHojeCents).toBe(0);
    expect(r.ritmoOk).toBe(false);
  });

  it('gasto além de dia a dia + extras não gera extras negativos', () => {
    const r = divisaoDiaADia({ ...base, gastoDiaADiaCents: 900_000 });
    expect(r.extrasDisponivelCents).toBe(0);
  });

  it('meta + parcelas > verba: tudo 0', () => {
    const r = divisaoDiaADia({ ...base, poupancaAlvoCents: 900_000 });
    expect(r).toMatchObject({
      gastavelCents: 0,
      diaADiaCents: 0,
      extrasCents: 0,
      usadoDiaADiaCents: 0,
      extrasDisponivelCents: 0,
      possoGastarHojeCents: 0,
    });
  });

  it('diasRestantes 0 não divide por zero', () => {
    const r = divisaoDiaADia({ ...base, diasRestantes: 0, gastoDiaADiaCents: 10_000 });
    expect(r.possoGastarHojeCents).toBe(239_990);
    expect(Number.isFinite(r.possoGastarHojeCents)).toBe(true);
  });

  it('ritmo ok no limite e acima', () => {
    // restantes 26 de 30 → 5 dias passados; limite = floor(249_990 × 5 / 30) = 41_665
    expect(divisaoDiaADia({ ...base, gastoDiaADiaCents: 41_665 }).ritmoOk).toBe(true);
    expect(divisaoDiaADia({ ...base, gastoDiaADiaCents: 41_666 }).ritmoOk).toBe(false);
  });
});
