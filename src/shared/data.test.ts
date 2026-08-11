import { describe, it, expect } from 'vitest';
import {
  parseData,
  formatData,
  addDias,
  addMeses,
  diffDias,
  ontem,
  estaNoIntervalo,
  ultimoDiaDoMes,
  dataCivilNoFuso,
  formatarDataCurta,
  formatarMesAno,
} from './data';

describe('parse/format round-trip (regressão do bug UTC)', () => {
  it('não retrocede um dia ao converter string -> Date -> string', () => {
    // O bug clássico: new Date("2026-07-29") vira 2026-07-28 no fuso do Brasil.
    for (const d of ['2026-07-29', '2026-01-01', '2026-12-31', '2024-02-29']) {
      expect(formatData(parseData(d))).toBe(d);
    }
  });
});

describe('dataCivilNoFuso (SPEC 9 — lançamento às 23h cai no dia correto)', () => {
  it('um instante às 23h50 de 29/07 em America/Bahia (UTC-3) é o dia civil 29/07', () => {
    // 2026-07-29 23:50 em UTC-3 == 2026-07-30 02:50 UTC.
    const instante = new Date('2026-07-30T02:50:00Z');
    expect(dataCivilNoFuso(instante, 'America/Bahia')).toBe('2026-07-29');
  });

  it('o mesmo instante em UTC já seria outro dia — prova que o fuso importa', () => {
    const instante = new Date('2026-07-30T02:50:00Z');
    expect(dataCivilNoFuso(instante, 'UTC')).toBe('2026-07-30');
  });

  it('meia-noite e dez em America/Bahia ainda é o dia local, não o dia UTC', () => {
    // 2026-03-10 00:10 UTC-3 == 2026-03-10 03:10 UTC.
    const instante = new Date('2026-03-10T03:10:00Z');
    expect(dataCivilNoFuso(instante, 'America/Bahia')).toBe('2026-03-10');
  });
});

describe('aritmética de datas', () => {
  it('addDias soma e subtrai', () => {
    expect(addDias('2026-07-29', 3)).toBe('2026-08-01');
    expect(addDias('2026-08-01', -1)).toBe('2026-07-31');
    expect(ontem('2026-01-01')).toBe('2025-12-31');
  });

  it('addMeses faz clamp de fim de mês', () => {
    expect(addMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMeses('2024-01-31', 1)).toBe('2024-02-29'); // bissexto
    expect(addMeses('2026-01-15', 6)).toBe('2026-07-15');
  });

  it('diffDias conta dias civis entre datas', () => {
    expect(diffDias('2026-08-04', '2026-08-04')).toBe(0);
    expect(diffDias('2026-08-04', '2026-08-01')).toBe(3);
    expect(diffDias('2026-08-01', '2026-08-04')).toBe(-3);
    expect(diffDias('2027-01-01', '2026-12-31')).toBe(1);
  });
});

describe('estaNoIntervalo (comparação lexicográfica)', () => {
  it('inclui as duas pontas', () => {
    expect(estaNoIntervalo('2026-07-05', '2026-07-05', '2026-08-04')).toBe(true);
    expect(estaNoIntervalo('2026-08-04', '2026-07-05', '2026-08-04')).toBe(true);
    expect(estaNoIntervalo('2026-08-05', '2026-07-05', '2026-08-04')).toBe(false);
    expect(estaNoIntervalo('2026-07-04', '2026-07-05', '2026-08-04')).toBe(false);
  });
});

describe('ultimoDiaDoMes', () => {
  it('lida com fevereiro comum e bissexto', () => {
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2024, 2)).toBe(29);
    expect(ultimoDiaDoMes(2026, 1)).toBe(31);
    expect(ultimoDiaDoMes(2026, 4)).toBe(30);
  });
});

describe('formatarDataCurta (rótulo "DD/MM")', () => {
  it('formata dia e mês na ordem brasileira, com zero à esquerda', () => {
    expect(formatarDataCurta('2026-08-04')).toBe('04/08');
    expect(formatarDataCurta('2026-12-31')).toBe('31/12');
    expect(formatarDataCurta('2026-01-01')).toBe('01/01');
  });

  it('não retrocede um dia (regressão do bug UTC)', () => {
    // `new Date("2026-07-29")` daria 28/07 no fuso do Brasil.
    expect(formatarDataCurta('2026-07-29')).toBe('29/07');
  });

  it('recusa data malformada em vez de devolver "undefined/undefined"', () => {
    expect(() => formatarDataCurta('29/07/2026')).toThrow(TypeError);
    expect(() => formatarDataCurta('2026-7-9')).toThrow(TypeError);
    expect(() => formatarDataCurta('')).toThrow(TypeError);
  });
});

describe('formatarMesAno (rótulo "mmm/AA" do eixo da projeção)', () => {
  it('abrevia o mês em pt-BR e usa o ano com dois dígitos', () => {
    expect(formatarMesAno('2026-08-04')).toBe('ago/26');
    expect(formatarMesAno('2027-01-31')).toBe('jan/27');
    expect(formatarMesAno('2026-12-01')).toBe('dez/26');
  });

  it('recusa data malformada', () => {
    expect(() => formatarMesAno('2026/08/04')).toThrow(TypeError);
    expect(() => formatarMesAno('ago/26')).toThrow(TypeError);
  });

  it('recusa mês fora de 01–12 mesmo com formato válido', () => {
    expect(() => formatarMesAno('2026-13-01')).toThrow(RangeError);
    expect(() => formatarMesAno('2026-00-01')).toThrow(RangeError);
  });
});
