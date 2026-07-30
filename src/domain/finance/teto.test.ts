import { describe, it, expect } from 'vitest';
import { addDias } from '@/shared/data';
import { calcularTeto, gastoRealizadoCents, tetoDoDia } from './teto';
import type { TransacaoCalc } from './tipos';

// Ciclo de referência: 05/07 a 04/08 (31 dias), verba R$ 3.100,00 -> teto inicial R$ 100,00/dia.
const FIM = '2026-08-04';
const VERBA = 310000;

function despesaVariavel(data: string, valorCents: number): TransacaoCalc {
  return { data, valorCents, tipo: 'DESPESA', grupoCategoria: 'VARIAVEL', provisaoId: null };
}

describe('gastoRealizadoCents — o que conta e o que não conta', () => {
  it('conta só DESPESA de grupo VARIAVEL até a data (inclusive)', () => {
    const txs = [despesaVariavel('2026-07-05', 5000), despesaVariavel('2026-07-06', 3000)];
    expect(gastoRealizadoCents(txs, '2026-07-05')).toBe(5000);
    expect(gastoRealizadoCents(txs, '2026-07-06')).toBe(8000);
  });

  it('TRANSFERENCIA e pagamento de fatura NÃO alteram o gasto (SPEC regras 1 e 2)', () => {
    const txs: TransacaoCalc[] = [
      despesaVariavel('2026-07-05', 5000),
      // pagamento de fatura do cartão = TRANSFERENCIA
      { data: '2026-07-10', valorCents: 500000, tipo: 'TRANSFERENCIA', grupoCategoria: null },
      // renda também é ignorada
      { data: '2026-07-10', valorCents: 800000, tipo: 'RENDA', grupoCategoria: 'RENDA' },
    ];
    expect(gastoRealizadoCents(txs, FIM)).toBe(5000);
  });

  it('DESPESA de grupo FIXO não consome verba variável (fixos já estão congelados)', () => {
    const txs: TransacaoCalc[] = [
      despesaVariavel('2026-07-05', 5000),
      { data: '2026-07-06', valorCents: 200000, tipo: 'DESPESA', grupoCategoria: 'FIXO' },
    ];
    expect(gastoRealizadoCents(txs, FIM)).toBe(5000);
  });

  it('gasto de provisão anual NÃO consome verba variável (item 3 / SPEC regra 8)', () => {
    const txs: TransacaoCalc[] = [
      despesaVariavel('2026-07-05', 5000),
      {
        data: '2026-07-06',
        valorCents: 250000,
        tipo: 'DESPESA',
        grupoCategoria: 'VARIAVEL',
        provisaoId: 'prov-ipva',
      },
    ];
    expect(gastoRealizadoCents(txs, FIM)).toBe(5000);
  });

  it('ESTORNO abate na data da transação original (SPEC regra 5)', () => {
    const txs: TransacaoCalc[] = [
      despesaVariavel('2026-07-10', 5000),
      despesaVariavel('2026-07-10', 3000),
      // estorno com data = data da original (a camada de app garante isso)
      { data: '2026-07-10', valorCents: 5000, tipo: 'ESTORNO', grupoCategoria: 'VARIAVEL' },
    ];
    // Antes do dia 10 nada aconteceu.
    expect(gastoRealizadoCents(txs, '2026-07-09')).toBe(0);
    // No dia 10: 5000 + 3000 − 5000 (estorno abatido no mesmo dia) = 3000.
    expect(gastoRealizadoCents(txs, '2026-07-10')).toBe(3000);
  });
});

describe('calcularTeto — primeiro, meio e último dia do ciclo (SPEC 9)', () => {
  it('primeiro dia, sem gastos', () => {
    const r = calcularTeto({ verbaVariavelCents: VERBA, dataFimCiclo: FIM, hoje: '2026-07-05', transacoes: [] });
    expect(r.diasRestantes).toBe(31);
    expect(r.saldoDisponivelCents).toBe(VERBA);
    expect(r.tetoHojeCents).toBe(10000);
    expect(r.gastoHojeCents).toBe(0);
    expect(r.restaHojeCents).toBe(10000);
    expect(r.emRecuperacao).toBe(false);
  });

  it('meio do ciclo: gastar exatamente o teto mantém o teto estável', () => {
    // Gastou 100,00 no dia 05; hoje é 06.
    const txs = [despesaVariavel('2026-07-05', 10000)];
    const r = calcularTeto({ verbaVariavelCents: VERBA, dataFimCiclo: FIM, hoje: '2026-07-06', transacoes: txs });
    expect(r.diasRestantes).toBe(30);
    expect(r.gastoAntesDeHojeCents).toBe(10000);
    expect(r.saldoDisponivelCents).toBe(300000);
    expect(r.tetoHojeCents).toBe(10000);
    expect(r.gastoHojeCents).toBe(0);
  });

  it('o teto exclui o gasto de hoje; "resta" é teto − gasto de hoje', () => {
    // Primeiro dia (31 dias -> teto exato de 100,00); já gastou 30,00 hoje.
    const txs = [despesaVariavel('2026-07-05', 3000)];
    const r = calcularTeto({ verbaVariavelCents: VERBA, dataFimCiclo: FIM, hoje: '2026-07-05', transacoes: txs });
    // Nada antes de hoje -> saldo cheio -> teto não encolhe com o gasto de hoje.
    expect(r.saldoDisponivelCents).toBe(VERBA);
    expect(r.tetoHojeCents).toBe(10000);
    expect(r.gastoHojeCents).toBe(3000);
    expect(r.restaHojeCents).toBe(7000);
  });

  it('último dia: o teto é todo o saldo restante (diasRestantes = 1)', () => {
    // Consumiu 3.000,00 antes do último dia -> sobra 100,00.
    const txs = [despesaVariavel('2026-07-20', 300000)];
    const r = calcularTeto({ verbaVariavelCents: VERBA, dataFimCiclo: FIM, hoje: FIM, transacoes: txs });
    expect(r.diasRestantes).toBe(1);
    expect(r.saldoDisponivelCents).toBe(10000);
    expect(r.tetoHojeCents).toBe(10000);
  });
});

describe('auto-correção e invariante da soma dos tetos (SPEC critério 3)', () => {
  it('um gasto grande hoje derruba o teto dos dias seguintes', () => {
    const tetoNormalDia6 = tetoDoDia({ verbaVariavelCents: VERBA, dataFimCiclo: FIM, dia: '2026-07-06', transacoes: [] });
    const tetoAposGastao = tetoDoDia({
      verbaVariavelCents: VERBA,
      dataFimCiclo: FIM,
      dia: '2026-07-06',
      transacoes: [despesaVariavel('2026-07-05', 200000)],
    });
    expect(tetoAposGastao).toBeLessThan(tetoNormalDia6);
  });

  it('gastando exatamente o teto a cada dia, a soma NUNCA ultrapassa o saldo e o teto nunca fica negativo', () => {
    const gastao = despesaVariavel('2026-07-05', 200000);
    const transacoes: TransacaoCalc[] = [gastao];
    const saldoAposGastao = VERBA - 200000;

    let somaTetosRestantes = 0;
    let dia = '2026-07-06';
    while (dia <= FIM) {
      const teto = tetoDoDia({ verbaVariavelCents: VERBA, dataFimCiclo: FIM, dia, transacoes });
      expect(teto).toBeGreaterThanOrEqual(0); // nunca negativo
      somaTetosRestantes += teto;
      transacoes.push(despesaVariavel(dia, teto)); // gasta exatamente o teto
      dia = addDias(dia, 1);
    }

    // A soma dos tetos dos dias restantes não ultrapassa o saldo disponível.
    expect(somaTetosRestantes).toBeLessThanOrEqual(saldoAposGastao);
    // E o total gasto no ciclo jamais excede a verba.
    expect(gastoRealizadoCents(transacoes, FIM)).toBeLessThanOrEqual(VERBA);
  });
});

describe('saldo negativo (SPEC 9) — nunca produz teto negativo', () => {
  it('gastou mais que a verba antes de hoje -> teto 0, marca recuperação', () => {
    const txs = [despesaVariavel('2026-07-05', 350000)]; // acima da verba de 310000
    const r = calcularTeto({ verbaVariavelCents: VERBA, dataFimCiclo: FIM, hoje: '2026-07-10', transacoes: txs });
    expect(r.saldoDisponivelCents).toBeLessThan(0);
    expect(r.tetoHojeCents).toBe(0);
    expect(r.emRecuperacao).toBe(true);
  });
});
