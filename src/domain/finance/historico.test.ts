import { describe, it, expect } from 'vitest';
import { montarHistorico, type CicloHistoricoInput, type LancamentoHistorico } from './historico';

function lancamento(overrides: Partial<LancamentoHistorico> = {}): LancamentoHistorico {
  return {
    data: '2026-08-15',
    valorCents: 10_000,
    tipo: 'DESPESA',
    grupoCategoria: 'VARIAVEL',
    provisaoId: null,
    parcelamentoId: null,
    ...overrides,
  };
}

function ciclo(overrides: Partial<CicloHistoricoInput> = {}): CicloHistoricoInput {
  return {
    cicloId: 'ciclo-ago',
    dataInicio: '2026-08-01',
    dataFim: '2026-08-31',
    rendaPrevistaCents: 3_000_000,
    rendaRealizadaCents: 3_000_000,
    fixosCents: 488_400,
    provisaoMensalCents: 50_000,
    poupancaAlvoCents: 1_800_000,
    verbaVariavelCents: 700_000,
    rolloverRecebidoCents: 0,
    sobraCents: 10_000,
    lancamentos: [],
    patrimonioFimCents: null,
    ...overrides,
  };
}

describe('montarHistorico', () => {
  it('lista vazia devolve estado vazio coerente, sem divisão por zero', () => {
    const estado = montarHistorico([]);
    expect(estado.serie).toEqual([]);
    expect(estado.meses).toEqual([]);
    expect(estado.totais).toEqual({
      meses: 0,
      rendaCents: 0,
      gastoTotalCents: 0,
      fixosCents: 0,
      parceladosCents: 0,
      variavelCents: 0,
      poupancaAlvoCents: 0,
      gastoMedioCents: 0,
      rendaMediaCents: 0,
    });
  });

  it('custo fixo congelado não é contado duas vezes junto do gasto variável', () => {
    const estado = montarHistorico([
      ciclo({
        fixosCents: 488_400,
        lancamentos: [lancamento({ valorCents: 20_000 }), lancamento({ valorCents: 5_000 })],
      }),
    ]);
    const mes = estado.serie[0]!;
    expect(mes.fixosCents).toBe(488_400);
    expect(mes.variavelCents).toBe(25_000);
    expect(mes.gastoTotalCents).toBe(488_400 + 25_000);
  });

  it('transação com provisaoId não entra em variavelCents', () => {
    const estado = montarHistorico([
      ciclo({
        lancamentos: [
          lancamento({ valorCents: 20_000 }),
          lancamento({ valorCents: 9_000, provisaoId: 'prov-1' }),
        ],
      }),
    ]);
    expect(estado.serie[0]!.variavelCents).toBe(20_000);
  });

  it('parcela entra em parceladosCents e não em variavelCents', () => {
    const estado = montarHistorico([
      ciclo({
        lancamentos: [
          lancamento({ valorCents: 20_000 }),
          lancamento({ valorCents: 15_000, parcelamentoId: 'parc-1' }),
        ],
      }),
    ]);
    const mes = estado.serie[0]!;
    expect(mes.variavelCents).toBe(20_000);
    expect(mes.parceladosCents).toBe(15_000);
    expect(mes.gastoTotalCents).toBe(mes.fixosCents + 20_000 + 15_000);
  });

  it('rendaRealizadaCents null cai para a prevista', () => {
    const estado = montarHistorico([
      ciclo({ rendaPrevistaCents: 3_000_000, rendaRealizadaCents: null }),
    ]);
    expect(estado.serie[0]!.rendaConsideradaCents).toBe(3_000_000);
  });

  it('variação de patrimônio: primeiro mês null com motivo, meses seguintes calculam a diferença', () => {
    const estado = montarHistorico([
      ciclo({ cicloId: 'jul', dataInicio: '2026-07-01', dataFim: '2026-07-31', patrimonioFimCents: 100_000 }),
      ciclo({ cicloId: 'ago', dataInicio: '2026-08-01', dataFim: '2026-08-31', patrimonioFimCents: 130_000 }),
    ]);

    const [jul, ago] = estado.serie;
    expect(jul!.variacaoPatrimonioCents).toBeNull();
    expect(jul!.motivoPatrimonioAusente).not.toBeNull();

    expect(ago!.variacaoPatrimonioCents).toBe(30_000);
    expect(ago!.motivoPatrimonioAusente).toBeNull();
  });

  it('mês sem snapshot devolve patrimonioFimCents e variação null, com motivo preenchido', () => {
    const estado = montarHistorico([
      ciclo({ cicloId: 'jul', dataInicio: '2026-07-01', dataFim: '2026-07-31', patrimonioFimCents: 100_000 }),
      ciclo({ cicloId: 'ago', dataInicio: '2026-08-01', dataFim: '2026-08-31', patrimonioFimCents: null }),
    ]);

    const ago = estado.serie[1]!;
    expect(ago.patrimonioFimCents).toBeNull();
    expect(ago.variacaoPatrimonioCents).toBeNull();
    expect(ago.motivoPatrimonioAusente).not.toBeNull();
  });

  it('mês seguinte a um mês sem snapshot também fica sem variação, com motivo próprio', () => {
    const estado = montarHistorico([
      ciclo({ cicloId: 'jul', dataInicio: '2026-07-01', dataFim: '2026-07-31', patrimonioFimCents: null }),
      ciclo({ cicloId: 'ago', dataInicio: '2026-08-01', dataFim: '2026-08-31', patrimonioFimCents: 130_000 }),
    ]);

    const ago = estado.serie[1]!;
    expect(ago.patrimonioFimCents).toBe(130_000);
    expect(ago.variacaoPatrimonioCents).toBeNull();
    expect(ago.motivoPatrimonioAusente).not.toBeNull();
  });

  it('serie está do mais antigo para o mais novo; meses do mais novo para o mais antigo', () => {
    const estado = montarHistorico([
      ciclo({ cicloId: 'ago', dataInicio: '2026-08-01', dataFim: '2026-08-31' }),
      ciclo({ cicloId: 'jun', dataInicio: '2026-06-01', dataFim: '2026-06-30' }),
      ciclo({ cicloId: 'jul', dataInicio: '2026-07-01', dataFim: '2026-07-31' }),
    ]);

    expect(estado.serie.map((m) => m.cicloId)).toEqual(['jun', 'jul', 'ago']);
    expect(estado.meses.map((m) => m.cicloId)).toEqual(['ago', 'jul', 'jun']);
    expect(estado.serie[0]!.rotulo).toBe('jun/26');
  });

  it('totais e médias usam divisão inteira (floor)', () => {
    const estado = montarHistorico([
      ciclo({ cicloId: 'a', dataInicio: '2026-06-01', dataFim: '2026-06-30', rendaRealizadaCents: 100 }),
      ciclo({ cicloId: 'b', dataInicio: '2026-07-01', dataFim: '2026-07-31', rendaRealizadaCents: 100 }),
      ciclo({ cicloId: 'c', dataInicio: '2026-08-01', dataFim: '2026-08-31', rendaRealizadaCents: 101 }),
    ]);

    expect(estado.totais.meses).toBe(3);
    expect(estado.totais.rendaCents).toBe(301);
    expect(estado.totais.rendaMediaCents).toBe(Math.floor(301 / 3));
  });
});
