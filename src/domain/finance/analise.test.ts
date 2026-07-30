import { describe, it, expect } from 'vitest';
import { analiseCategoria, detectarAssinaturas, normalizarDescricao } from './analise';

describe('analiseCategoria (SPEC 5.5)', () => {
  it('calcula médias, ticket, custo anualizado e tendência', () => {
    const r = analiseCategoria({
      ciclos: [
        { cicloId: 'c1', valoresCents: [4000, 4000, 4000] }, // 120,00 / 3 tx
        { cicloId: 'c2', valoresCents: [4000, 4000] }, // 80,00 / 2 tx
        { cicloId: 'c3', valoresCents: [4000, 4000, 4000, 4000] }, // 160,00 / 4 tx
      ],
      essencial: false,
    });
    // total 12000+8000+16000 = 36000; média mensal = 12000
    expect(r.totalMedioMensalCents).toBe(12000);
    // 9 transações em 3 ciclos = 3/ciclo
    expect(r.frequenciaMedia).toBe(3);
    // ticket = 36000 / 9 = 4000
    expect(r.ticketMedioCents).toBe(4000);
    // custo anualizado = 12000 * 12
    expect(r.custoAnualizadoCents).toBe(144000);
    // 1º ciclo 12000 vs 3º ciclo 16000 -> subiu > 10%
    expect(r.tendencia).toBe('SUBINDO');
    expect(r.essencial).toBe(false);
  });

  it('tendência CAINDO quando o último ciclo é bem menor que o primeiro', () => {
    const r = analiseCategoria({
      ciclos: [
        { cicloId: 'c1', valoresCents: [10000] },
        { cicloId: 'c2', valoresCents: [8000] },
        { cicloId: 'c3', valoresCents: [5000] },
      ],
      essencial: true,
    });
    expect(r.tendencia).toBe('CAINDO');
  });

  it('categoria sem histórico devolve zeros e ESTAVEL', () => {
    const r = analiseCategoria({ ciclos: [], essencial: false });
    expect(r.totalMedioMensalCents).toBe(0);
    expect(r.tendencia).toBe('ESTAVEL');
  });

  it('abate ESTORNO do total (consistente com o motor de gasto)', () => {
    const r = analiseCategoria({
      ciclos: [
        // 3 despesas de 40,00 (120,00) menos um estorno de 40,00 = 80,00 líquido.
        { cicloId: 'c1', valoresCents: [4000, 4000, 4000], estornosCents: [4000] },
      ],
      essencial: false,
    });
    // total líquido do mês = 8000
    expect(r.totalMedioMensalCents).toBe(8000);
    expect(r.custoAnualizadoCents).toBe(8000 * 12);
    // ticket médio continua bruto (média da compra): 12000 / 3 = 4000
    expect(r.ticketMedioCents).toBe(4000);
    expect(r.frequenciaMedia).toBe(3);
  });
});

describe('normalizarDescricao', () => {
  it('remove acentos, baixa a caixa e colapsa espaços', () => {
    expect(normalizarDescricao('  Spotify  Família ')).toBe('spotify familia');
    expect(normalizarDescricao('NETFLIX')).toBe('netflix');
    expect(normalizarDescricao(null)).toBe('');
  });
});

describe('detectarAssinaturas (SPEC 5.5)', () => {
  const ciclos = ['c1', 'c2', 'c3', 'c4'];

  it('sinaliza mesmo valor + descrição em 3+ ciclos consecutivos com custo anualizado', () => {
    const detectadas = detectarAssinaturas({
      ciclosOrdenados: ciclos,
      transacoes: [
        { descricao: 'Spotify', valorCents: 2190, cicloId: 'c1' },
        { descricao: 'spotify', valorCents: 2190, cicloId: 'c2' },
        { descricao: 'SPOTIFY', valorCents: 2190, cicloId: 'c3' },
        // gasto avulso não recorrente
        { descricao: 'Mercado', valorCents: 15000, cicloId: 'c1' },
      ],
    });
    expect(detectadas).toHaveLength(1);
    expect(detectadas[0]?.descricaoNormalizada).toBe('spotify');
    expect(detectadas[0]?.ciclosConsecutivos).toBe(3);
    expect(detectadas[0]?.custoAnualizadoCents).toBe(2190 * 12);
  });

  it('não sinaliza quando os ciclos não são consecutivos', () => {
    const detectadas = detectarAssinaturas({
      ciclosOrdenados: ciclos,
      transacoes: [
        { descricao: 'Academia', valorCents: 9900, cicloId: 'c1' },
        { descricao: 'Academia', valorCents: 9900, cicloId: 'c2' },
        // pula c3
        { descricao: 'Academia', valorCents: 9900, cicloId: 'c4' },
      ],
    });
    expect(detectadas).toHaveLength(0);
  });
});
