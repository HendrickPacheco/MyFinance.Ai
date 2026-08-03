import { describe, it, expect } from 'vitest';
import {
  sugerirRendaPrevistaCents,
  verificarMetaIrreal,
  sugerirMetaPoupancaCents,
} from './sugestoes';

describe('sugerirRendaPrevistaCents (regra 6 — renda variável)', () => {
  it('sem histórico não sugere nada', () => {
    expect(sugerirRendaPrevistaCents([])).toBeNull();
  });

  it('com apenas 1 ciclo fechado não sugere nada (mínimo 2)', () => {
    expect(sugerirRendaPrevistaCents([500000])).toBeNull();
  });

  it('com exatamente 2 ciclos, sugere a MENOR renda, nunca a média', () => {
    // menor = 400000; média seria 450000 — não pode ser essa a sugestão.
    expect(sugerirRendaPrevistaCents([500000, 400000])).toBe(400000);
  });

  it('com exatamente 6 ciclos, considera todos', () => {
    const rendas = [500000, 480000, 300000, 520000, 510000, 495000];
    expect(sugerirRendaPrevistaCents(rendas)).toBe(300000);
  });

  it('com mais de 6 ciclos, ignora os anteriores ao 6º mais recente', () => {
    // Os 2 primeiros são os mais recentes; do 7º elemento em diante (100000) é
    // histórico antigo demais e deve ser ignorado.
    const rendas = [500000, 480000, 300000, 520000, 510000, 495000, 100000, 50000];
    expect(sugerirRendaPrevistaCents(rendas)).toBe(300000);
  });

  it('ordem não importa para o resultado dentro da janela considerada', () => {
    expect(sugerirRendaPrevistaCents([400000, 500000])).toBe(400000);
  });
});

describe('verificarMetaIrreal (regra 12 — piso diário configurável)', () => {
  it('verba diária EXATAMENTE no piso não é considerada irreal', () => {
    // 1500 * 30 = 45000 -> verba diária exata de 1500
    const r = verificarMetaIrreal({
      verbaVariavelCents: 45000,
      diasCiclo: 30,
      pisoDiarioCents: 1500,
    });
    expect(r.verbaDiariaCents).toBe(1500);
    expect(r.irreal).toBe(false);
  });

  it('1 centavo abaixo do piso já é considerado irreal', () => {
    // 44999 / 30 = floor(1499.96) = 1499 -> 1 centavo abaixo de 1500
    const r = verificarMetaIrreal({
      verbaVariavelCents: 44999,
      diasCiclo: 30,
      pisoDiarioCents: 1500,
    });
    expect(r.verbaDiariaCents).toBe(1499);
    expect(r.irreal).toBe(true);
  });

  it('verba variável negativa é sempre irreal', () => {
    const r = verificarMetaIrreal({
      verbaVariavelCents: -10000,
      diasCiclo: 30,
      pisoDiarioCents: 1500,
    });
    expect(r.irreal).toBe(true);
  });

  it('rejeita diasCiclo zero ou negativo', () => {
    expect(() =>
      verificarMetaIrreal({ verbaVariavelCents: 45000, diasCiclo: 0, pisoDiarioCents: 1500 }),
    ).toThrow(RangeError);
    expect(() =>
      verificarMetaIrreal({ verbaVariavelCents: 45000, diasCiclo: -5, pisoDiarioCents: 1500 }),
    ).toThrow(RangeError);
  });
});

describe('sugerirMetaPoupancaCents (regra 12 — sugestão a partir da folga)', () => {
  it('sem ciclos suficientes não sugere nada', () => {
    expect(sugerirMetaPoupancaCents([])).toBeNull();
    expect(sugerirMetaPoupancaCents([{ poupancaAlvoCents: 100000, sobraCents: 5000 }])).toBeNull();
  });

  it('bateu a meta com folga nos 2 últimos ciclos -> sugere a menor das duas metas', () => {
    const r = sugerirMetaPoupancaCents([
      { poupancaAlvoCents: 90000, sobraCents: 3000 },
      { poupancaAlvoCents: 100000, sobraCents: 8000 },
    ]);
    expect(r).toBe(90000);
  });

  it('sobra negativa em qualquer um dos 2 ciclos não gera sugestão', () => {
    expect(
      sugerirMetaPoupancaCents([
        { poupancaAlvoCents: 90000, sobraCents: -1000 },
        { poupancaAlvoCents: 100000, sobraCents: 8000 },
      ]),
    ).toBeNull();
  });

  it('sobra nula (ciclo ainda em aberto) não gera sugestão', () => {
    expect(
      sugerirMetaPoupancaCents([
        { poupancaAlvoCents: 90000, sobraCents: null },
        { poupancaAlvoCents: 100000, sobraCents: 8000 },
      ]),
    ).toBeNull();
  });

  it('sobra exatamente zero não conta como "com folga"', () => {
    expect(
      sugerirMetaPoupancaCents([
        { poupancaAlvoCents: 90000, sobraCents: 0 },
        { poupancaAlvoCents: 100000, sobraCents: 8000 },
      ]),
    ).toBeNull();
  });

  it('considera só os 2 primeiros elementos mesmo com histórico maior', () => {
    const r = sugerirMetaPoupancaCents([
      { poupancaAlvoCents: 90000, sobraCents: 3000 },
      { poupancaAlvoCents: 100000, sobraCents: 8000 },
      { poupancaAlvoCents: 1000, sobraCents: -50000 }, // ciclo antigo ruim, deve ser ignorado
    ]);
    expect(r).toBe(90000);
  });
});
