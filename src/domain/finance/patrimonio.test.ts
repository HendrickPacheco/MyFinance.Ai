import { describe, it, expect } from 'vitest';
import {
  totalPatrimonioCents,
  variacaoMensalCents,
  taxaAcumulacaoMediaCents,
  mesesDeReserva,
  totalPorClasseCents,
  divergenciasConciliacao,
  type ItemConciliavel,
} from './patrimonio';

describe('patrimônio (SPEC 5.6)', () => {
  it('total do snapshot é a soma dos itens', () => {
    expect(totalPatrimonioCents([100000, 250000, 50000])).toBe(400000);
    expect(totalPatrimonioCents([])).toBe(0);
  });

  it('variação mensal pode ser negativa', () => {
    expect(variacaoMensalCents(400000, 350000)).toBe(50000);
    expect(variacaoMensalCents(300000, 350000)).toBe(-50000);
  });

  it('taxa de acumulação média usa a janela das últimas variações', () => {
    // Totais crescendo 100,00 por mês -> variação média 10000.
    expect(taxaAcumulacaoMediaCents([100000, 110000, 120000, 130000])).toBe(10000);
    // menos de 2 pontos -> 0
    expect(taxaAcumulacaoMediaCents([100000])).toBe(0);
  });

  it('meses de reserva = saldo / custo mensal médio', () => {
    expect(mesesDeReserva({ saldoReservaCents: 600000, custoMensalMedioCents: 200000 })).toBe(3);
  });

  it('sem histórico de custo (divisor ausente) é não calculável, não 0 fabricado', () => {
    expect(mesesDeReserva({ saldoReservaCents: 600000, custoMensalMedioCents: null })).toBeNull();
  });

  it('reserva genuinamente zerada com custo real conhecido devolve 0 de verdade', () => {
    expect(mesesDeReserva({ saldoReservaCents: 0, custoMensalMedioCents: 200000 })).toBe(0);
  });

  it('custo mensal negativo não explode: sem divisor confiável, é não calculável', () => {
    expect(mesesDeReserva({ saldoReservaCents: 600000, custoMensalMedioCents: -50000 })).toBeNull();
  });

  it('reserva negativa com custo real conhecido devolve meses negativos (sinal real, não fabricado)', () => {
    expect(mesesDeReserva({ saldoReservaCents: -100000, custoMensalMedioCents: 200000 })).toBe(-0.5);
  });

  it('total por classe soma itens da mesma classe, preservando ordem de aparição', () => {
    expect(
      totalPorClasseCents([
        { classe: 'CONTA', valorCents: 100000 },
        { classe: 'CRIPTO', valorCents: 20000 },
        { classe: 'CONTA', valorCents: 50000 },
      ]),
    ).toEqual([
      { classe: 'CONTA', totalCents: 150000 },
      { classe: 'CRIPTO', totalCents: 20000 },
    ]);
  });

  it('total por classe de lista vazia devolve lista vazia', () => {
    expect(totalPorClasseCents([])).toEqual([]);
  });
});

/**
 * Conciliação razão × realidade. O razão (`Conta.saldoCents`) é o que o app
 * calculou; a realidade (`ItemPatrimonio.valorCents`) é o que o dono viu no
 * banco. A diferença é sinal — gasto não lançado, rendimento — e por isso a
 * função só REPORTA: nada aqui escreve.
 */
describe('divergenciasConciliacao', () => {
  function item(patch: Partial<ItemConciliavel> = {}): ItemConciliavel {
    return { id: 'i1', nome: 'Reserva', contaId: 'conta-reserva', valorCents: 6_000_000, ...patch };
  }

  it('reporta a diferença entre o observado e o razão', () => {
    const r = divergenciasConciliacao([item()], new Map([['conta-reserva', 5_500_000]]));

    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      itemId: 'i1',
      contaId: 'conta-reserva',
      razaoCents: 5_500_000,
      observadoCents: 6_000_000,
      deltaCents: 500_000, // sobrou: o app achava que você tinha menos
    });
  });

  it('delta negativo quando o app achava que você tinha mais', () => {
    const r = divergenciasConciliacao(
      [item({ valorCents: 5_000_000 })],
      new Map([['conta-reserva', 5_500_000]]),
    );

    expect(r[0]?.deltaCents).toBe(-500_000);
  });

  it('item que bate não vira divergência — zero não é informação', () => {
    const r = divergenciasConciliacao([item()], new Map([['conta-reserva', 6_000_000]]));

    expect(r).toEqual([]);
  });

  it('item sem conta vinculada é ignorado (imóvel, cripto: não há razão para comparar)', () => {
    const r = divergenciasConciliacao(
      [item({ contaId: null })],
      new Map([['conta-reserva', 1]]),
    );

    expect(r).toEqual([]);
  });

  it('conta ausente do mapa não vira divergência contra zero', () => {
    // Conta arquivada ou apagada: ausência de razão, não razão igual a zero.
    // Tratar como zero acusaria uma divergência de 60k que não existe.
    const r = divergenciasConciliacao([item()], new Map());

    expect(r).toEqual([]);
  });

  it('reporta só os itens divergentes de uma lista mista', () => {
    const r = divergenciasConciliacao(
      [
        item({ id: 'ok', contaId: 'a', valorCents: 100 }),
        item({ id: 'diverge', contaId: 'b', valorCents: 300 }),
        item({ id: 'solto', contaId: null, valorCents: 999 }),
      ],
      new Map([
        ['a', 100],
        ['b', 250],
      ]),
    );

    expect(r.map((d) => d.itemId)).toEqual(['diverge']);
    expect(r[0]?.deltaCents).toBe(50);
  });
});
