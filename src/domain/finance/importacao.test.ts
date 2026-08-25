import { describe, it, expect } from 'vitest';
import { chaveDeduplicacao, conciliarFatura } from './importacao';
import type {
  CustoFixoConciliavel,
  ItemExtraido,
  TransacaoConciliavel,
} from './importacao-tipos';

/** Fábrica de `ItemExtraido` com defaults sensatos — cada teste só sobrescreve o que importa. */
function item(overrides: Partial<ItemExtraido> & { ordem: number }): ItemExtraido {
  return {
    descricaoOriginal: 'ESTABELECIMENTO GENERICO',
    valorCents: 5000,
    sinal: 'COMPRA',
    data: '2026-08-10',
    dataOriginalTexto: '10/08',
    parcela: null,
    confianca: 'ALTA',
    ...overrides,
  };
}

function transacao(overrides: Partial<TransacaoConciliavel> & { id: string }): TransacaoConciliavel {
  return {
    data: '2026-08-10',
    valorCents: 5000,
    descricao: 'estabelecimento generico',
    parcelamentoId: null,
    parcelaNum: null,
    ...overrides,
  };
}

function custoFixo(overrides: Partial<CustoFixoConciliavel> & { id: string }): CustoFixoConciliavel {
  return {
    nome: 'Aluguel',
    valorCents: 180000,
    diaVencimento: 10,
    ...overrides,
  };
}

describe('conciliarFatura — R1: custo fixo nunca vira transação (TASKS-IMPORTACAO §7.1, §13)', () => {
  it('linha que casa com CustoFixo produz CASA_CUSTO_FIXO, nunca um veredito de criação', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, descricaoOriginal: 'ALUGUEL IMOBILIARIA XPTO', valorCents: 180000, data: '2026-08-10' })],
      transacoes: [],
      custosFixos: [custoFixo({ id: 'cf-1' })],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });

    const [conciliado] = resultado.itens;
    expect(conciliado?.veredito.tipo).toBe('CASA_CUSTO_FIXO');
    // Trava explícita: nenhum dos tipos de veredito que a aplicação traduz em
    // `criarTransacao`/`criarParcelamento` pode coexistir com o casamento.
    expect(['NOVA_AVULSA', 'NOVA_PARCELA_ORFA']).not.toContain(conciliado?.veredito.tipo);
    if (conciliado?.veredito.tipo === 'CASA_CUSTO_FIXO') {
      expect(conciliado.veredito.custoFixoId).toBe('cf-1');
    }
    expect(conciliado?.faixa).toBe('CUSTO_FIXO_RECONHECIDO');
  });

  it('duas linhas com o valor do custo fixo: UMA casa, a outra não vira um segundo pagamento do mesmo custo', () => {
    // O erro que este teste existe para pegar: as duas linhas casarem com o
    // MESMO `CustoFixo`. Isso marcaria o aluguel como pago duas vezes e — pior
    // — ensinaria a conciliação a tratar custo fixo como algo que se repete
    // dentro do ciclo, que é o primeiro passo para ele virar `Transacao` (R1).
    // A segunda linha é dinheiro que saiu de verdade: tem que aparecer para o
    // dono decidir, nunca sumir por "já casou".
    const custos = [custoFixo({ id: 'cf-1', nome: 'Aluguel', valorCents: 180000, diaVencimento: 5 })];
    const resultado = conciliarFatura({
      itens: [
        item({ ordem: 1, descricaoOriginal: 'ALUGUEL', valorCents: 180000, data: '2026-08-05' }),
        item({ ordem: 2, descricaoOriginal: 'MERCADO', valorCents: 12000, data: '2026-08-06' }),
        item({ ordem: 3, descricaoOriginal: 'ALUGUEL COBRANCA', valorCents: 180000, data: '2026-08-07' }),
      ],
      transacoes: [],
      custosFixos: custos,
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });

    const queCasaramCustoFixo = resultado.itens.filter((i) => i.veredito.tipo === 'CASA_CUSTO_FIXO');
    expect(queCasaramCustoFixo).toHaveLength(1);
    expect(queCasaramCustoFixo[0]?.item.ordem).toBe(1);

    // A segunda linha de aluguel NÃO desapareceu nem virou pagamento do mesmo
    // custo fixo: ela é um gasto que o dono precisa ver.
    const segundaLinhaDeAluguel = resultado.itens.find((i) => i.item.ordem === 3);
    expect(segundaLinhaDeAluguel?.veredito.tipo).not.toBe('CASA_CUSTO_FIXO');
    expect(segundaLinhaDeAluguel?.veredito.tipo).toBe('NOVA_AVULSA');

    // E o total da fatura continua contando as duas: divergência é sinal (D-13).
    expect(resultado.totais.comprasCents).toBe(180000 + 12000 + 180000);
  });
});

describe('conciliarFatura — nível 1 (exato)', () => {
  it('mesmo valor, mesma descrição normalizada, diffDias === 0 -> CASA_VARIAVEL', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, descricaoOriginal: 'Padaria Sao Jose', valorCents: 3200, data: '2026-08-10' })],
      transacoes: [transacao({ id: 't1', descricao: 'PADARIA SAO JOSE', valorCents: 3200, data: '2026-08-10' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.itens[0]?.veredito).toMatchObject({ tipo: 'CASA_VARIAVEL', transacaoId: 't1' });
    expect(resultado.itens[0]?.faixa).toBe('JA_REGISTRADO');
  });
});

describe('conciliarFatura — nível 2 (afinidade de tokens, não Levenshtein)', () => {
  it('"PAG*IFOOD SAO PAULO BR" casa com "ifood" dentro da janela — token >=4 chars é prefixo', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, descricaoOriginal: 'PAG*IFOOD SAO PAULO BR', valorCents: 4500, data: '2026-08-10' })],
      transacoes: [transacao({ id: 't1', descricao: 'ifood', valorCents: 4500, data: '2026-08-11' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.itens[0]?.veredito).toMatchObject({ tipo: 'CASA_VARIAVEL', transacaoId: 't1' });
  });

  it('token de ruído ("compra", "sao", "paulo", "br", "pag", "pagto") não conta como afinidade sozinho', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, descricaoOriginal: 'COMPRA SAO PAULO BR', valorCents: 9900, data: '2026-08-10' })],
      transacoes: [transacao({ id: 't1', descricao: 'PAGTO SAO PAULO BR', valorCents: 9900, data: '2026-08-11' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    // Sem token relevante sobrando dos dois lados, só valor bate -> nível 3 (ambígua).
    expect(resultado.itens[0]?.veredito.tipo).toBe('AMBIGUA');
  });

  it('fora da janela de dias, mesmo com descrição idêntica, não casa automaticamente', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, descricaoOriginal: 'NETFLIX', valorCents: 3990, data: '2026-08-01' })],
      transacoes: [transacao({ id: 't1', descricao: 'NETFLIX', valorCents: 3990, data: '2026-08-10' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
      janelaDias: 3,
    });
    expect(resultado.itens[0]?.veredito.tipo).toBe('NOVA_AVULSA');
  });
});

describe('conciliarFatura — nível 3 (só valor) e ambiguidade', () => {
  it('mesmo valor na janela, descrição não bate -> AMBIGUA, nunca auto-aprovada', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, descricaoOriginal: 'LOJA DESCONHECIDA', valorCents: 7500, data: '2026-08-10' })],
      transacoes: [transacao({ id: 't1', descricao: 'OUTRO ESTABELECIMENTO', valorCents: 7500, data: '2026-08-11' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    const veredito = resultado.itens[0]?.veredito;
    expect(veredito?.tipo).toBe('AMBIGUA');
    if (veredito?.tipo === 'AMBIGUA') {
      expect(veredito.candidatos).toEqual([
        { transacaoId: 't1', data: '2026-08-11', valorCents: 7500, descricao: 'OUTRO ESTABELECIMENTO' },
      ]);
    }
    expect(resultado.itens[0]?.faixa).toBe('PRECISA_DE_VOCE');
  });
});

describe('conciliarFatura — atribuição 1-para-1 determinística (dois passes gulosos)', () => {
  it('duas compras idênticas de R$ 30 no mesmo dia contra UMA transação -> uma CASA_VARIAVEL, uma NOVA_AVULSA', () => {
    const resultado = conciliarFatura({
      itens: [
        item({ ordem: 1, descricaoOriginal: 'PADARIA', valorCents: 3000, data: '2026-08-10' }),
        item({ ordem: 2, descricaoOriginal: 'PADARIA', valorCents: 3000, data: '2026-08-10' }),
      ],
      transacoes: [transacao({ id: 't1', descricao: 'PADARIA', valorCents: 3000, data: '2026-08-10' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    const tipos = resultado.itens.map((i) => i.veredito.tipo).sort();
    expect(tipos).toEqual(['CASA_VARIAVEL', 'NOVA_AVULSA']);
    // A transação é consumida por, no máximo, uma linha.
    const consumidoresDeT1 = resultado.itens.filter(
      (i) => i.veredito.tipo === 'CASA_VARIAVEL' && i.veredito.transacaoId === 't1',
    );
    expect(consumidoresDeT1).toHaveLength(1);
  });

  it('nível 1 é resolvido em todos os itens antes de nível 2 começar a consumir transações', () => {
    // item 1 casa em nível 2 (afinidade) se processado sozinho; item 2 casa em
    // nível 1 (exato) contra a MESMA transação. O passe 1 deve reservar a
    // transação para o exato, deixando o item 1 sem casamento em nível 2.
    const resultado = conciliarFatura({
      itens: [
        item({ ordem: 1, descricaoOriginal: 'UBER TRIP SAO PAULO BR', valorCents: 2500, data: '2026-08-10' }),
        item({ ordem: 2, descricaoOriginal: 'uber', valorCents: 2500, data: '2026-08-10' }),
      ],
      transacoes: [transacao({ id: 't1', descricao: 'uber', valorCents: 2500, data: '2026-08-10' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    const item2 = resultado.itens.find((i) => i.item.ordem === 2);
    const item1 = resultado.itens.find((i) => i.item.ordem === 1);
    expect(item2?.veredito).toMatchObject({ tipo: 'CASA_VARIAVEL', transacaoId: 't1' });
    expect(item1?.veredito.tipo).not.toBe('CASA_VARIAVEL');
  });
});

describe('conciliarFatura — parcelas (§7.3, §8, D-17)', () => {
  it('parcela casa por parcelamentoId + parcelaNum + valor, descrição é só desempate', () => {
    const resultado = conciliarFatura({
      itens: [
        item({
          ordem: 1,
          descricaoOriginal: 'LOJA XPTO PARC 03/12',
          valorCents: 15000,
          data: '2026-08-10',
          parcela: { atual: 3, total: 12 },
        }),
      ],
      transacoes: [
        transacao({ id: 't1', descricao: 'texto completamente diferente', valorCents: 15000, data: '2026-08-01', parcelamentoId: 'p1', parcelaNum: 3 }),
      ],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.itens[0]?.veredito).toMatchObject({
      tipo: 'CASA_PARCELA',
      transacaoId: 't1',
      parcelamentoId: 'p1',
      parcelaNum: 3,
    });
    expect(resultado.itens[0]?.faixa).toBe('JA_REGISTRADO');
  });

  it('parcela atual === 1 sem casamento -> NOVA_AVULSA (a aplicação cria o parcelamento)', () => {
    const resultado = conciliarFatura({
      itens: [
        item({ ordem: 1, valorCents: 20000, data: '2026-08-10', parcela: { atual: 1, total: 6 } }),
      ],
      transacoes: [],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.itens[0]?.veredito.tipo).toBe('NOVA_AVULSA');
  });

  it('parcela atual > 1 sem parcelamento conhecido -> NOVA_PARCELA_ORFA (D-17 opção c)', () => {
    const resultado = conciliarFatura({
      itens: [
        item({ ordem: 1, valorCents: 20000, data: '2026-08-10', parcela: { atual: 3, total: 12 } }),
      ],
      transacoes: [],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.itens[0]?.veredito).toMatchObject({ tipo: 'NOVA_PARCELA_ORFA', atual: 3, total: 12 });
    expect(resultado.itens[0]?.faixa).toBe('PRECISA_DE_VOCE');
  });
});

describe('conciliarFatura — casos chatos (§7.4, §8)', () => {
  it('ESTORNO é sempre IGNORAR e nunca propõe nada, mesmo casando com uma compra', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, sinal: 'ESTORNO', valorCents: 5000, data: '2026-08-10' })],
      transacoes: [transacao({ id: 't1', valorCents: 5000, data: '2026-08-10' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.itens[0]?.veredito.tipo).toBe('IGNORAR');
    expect(resultado.itens[0]?.faixa).toBe('IGNORADO');
    expect(resultado.itens[0]?.veredito.motivo).toContain('2026-08-10');
  });

  it('PAGAMENTO_FATURA é sempre IGNORAR, mesmo sem transação nenhuma para comparar', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, sinal: 'PAGAMENTO_FATURA', valorCents: 843210 })],
      transacoes: [],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.itens[0]?.veredito.tipo).toBe('IGNORAR');
  });

  it('TARIFA vira NOVA_AVULSA mas na faixa PRECISA_DE_VOCE — consome verba, não é trivial', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, sinal: 'TARIFA', descricaoOriginal: 'IOF', valorCents: 350 })],
      transacoes: [],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.itens[0]?.veredito.tipo).toBe('NOVA_AVULSA');
    expect(resultado.itens[0]?.faixa).toBe('PRECISA_DE_VOCE');
  });

  it('data irresolúvel (null) -> rejeitada com motivo, e a importação segue com o resto', () => {
    const resultado = conciliarFatura({
      itens: [
        item({ ordem: 1, data: null, dataOriginalTexto: '31/02' }),
        item({ ordem: 2, descricaoOriginal: 'OUTRA COMPRA', valorCents: 1000, data: '2026-08-12' }),
      ],
      transacoes: [],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.rejeitadas).toHaveLength(1);
    expect(resultado.rejeitadas[0]?.motivo).toContain('31/02');
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0]?.item.ordem).toBe(2);
  });

  it('valor não-inteiro ou <= 0 -> rejeitada com motivo, sem abortar a fatura', () => {
    const resultado = conciliarFatura({
      itens: [
        item({ ordem: 1, valorCents: 10.5 }),
        item({ ordem: 2, valorCents: 0 }),
        item({ ordem: 3, valorCents: -100 }),
        item({ ordem: 4, descricaoOriginal: 'VALIDA', valorCents: 1000, data: '2026-08-12' }),
      ],
      transacoes: [],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.rejeitadas).toHaveLength(3);
    expect(resultado.itens).toHaveLength(1);
  });

  it('linha cuja competência cai num ciclo fechado é retroativa e vai para PRECISA_DE_VOCE mesmo sendo nova', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, descricaoOriginal: 'COMPRA RETROATIVA', valorCents: 4000, data: '2026-07-15' })],
      transacoes: [],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [{ dataInicio: '2026-07-01', dataFim: '2026-07-31' }],
    });
    expect(resultado.itens[0]?.retroativa).toBe(true);
    expect(resultado.itens[0]?.veredito.tipo).toBe('NOVA_AVULSA');
    expect(resultado.itens[0]?.faixa).toBe('PRECISA_DE_VOCE');
  });

  it('ciclo fechado não reclassifica um veredito que já não grava nada (JA_REGISTRADO continua JA_REGISTRADO)', () => {
    const resultado = conciliarFatura({
      itens: [item({ ordem: 1, descricaoOriginal: 'padaria', valorCents: 3000, data: '2026-07-15' })],
      transacoes: [transacao({ id: 't1', descricao: 'padaria', valorCents: 3000, data: '2026-07-15' })],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [{ dataInicio: '2026-07-01', dataFim: '2026-07-31' }],
    });
    expect(resultado.itens[0]?.retroativa).toBe(true);
    expect(resultado.itens[0]?.veredito.tipo).toBe('CASA_VARIAVEL');
    expect(resultado.itens[0]?.faixa).toBe('JA_REGISTRADO');
  });
});

describe('conciliarFatura — totais por sinal (D-13: divergência é sinal, não erro a esconder)', () => {
  it('soma cada sinal separadamente, ignorando linhas rejeitadas', () => {
    const resultado = conciliarFatura({
      itens: [
        item({ ordem: 1, sinal: 'COMPRA', valorCents: 1000, data: '2026-08-01' }),
        item({ ordem: 2, sinal: 'COMPRA', valorCents: 2000, data: '2026-08-02' }),
        item({ ordem: 3, sinal: 'ESTORNO', valorCents: 500, data: '2026-08-03' }),
        item({ ordem: 4, sinal: 'TARIFA', valorCents: 350, data: '2026-08-04' }),
        item({ ordem: 5, sinal: 'PAGAMENTO_FATURA', valorCents: 500000, data: '2026-08-05' }),
        item({ ordem: 6, sinal: 'COMPRA', valorCents: 999, data: null, dataOriginalTexto: '??' }),
      ],
      transacoes: [],
      custosFixos: [],
      pagamentosDoCiclo: [],
      ciclosFechados: [],
    });
    expect(resultado.totais).toEqual({
      comprasCents: 3000,
      estornosCents: 500,
      tarifasCents: 350,
      pagamentosFaturaCents: 500000,
    });
  });
});

describe('chaveDeduplicacao', () => {
  it('é determinística: o mesmo item produz sempre a mesma chave', () => {
    const a = item({ ordem: 1, descricaoOriginal: 'NETFLIX', valorCents: 3990, data: '2026-08-10' });
    const b = item({ ordem: 99, descricaoOriginal: 'NETFLIX', valorCents: 3990, data: '2026-08-10' });
    // `ordem` não entra na chave — reimportar a mesma fatura com linhas
    // reordenadas ainda reconhece o mesmo lançamento (§11).
    expect(chaveDeduplicacao(a)).toBe(chaveDeduplicacao(b));
  });

  it('itens com valor, data, descrição ou parcela diferentes geram chaves diferentes', () => {
    const base = item({ ordem: 1, descricaoOriginal: 'NETFLIX', valorCents: 3990, data: '2026-08-10' });
    const valorDiferente = item({ ordem: 1, descricaoOriginal: 'NETFLIX', valorCents: 4000, data: '2026-08-10' });
    const dataDiferente = item({ ordem: 1, descricaoOriginal: 'NETFLIX', valorCents: 3990, data: '2026-08-11' });
    const parcelaDiferente = item({
      ordem: 1,
      descricaoOriginal: 'NETFLIX',
      valorCents: 3990,
      data: '2026-08-10',
      parcela: { atual: 1, total: 3 },
    });
    const chaves = new Set([
      chaveDeduplicacao(base),
      chaveDeduplicacao(valorDiferente),
      chaveDeduplicacao(dataDiferente),
      chaveDeduplicacao(parcelaDiferente),
    ]);
    expect(chaves.size).toBe(4);
  });

  it('linha com data ambígua (null) ainda tem chave estável via dataOriginalTexto', () => {
    const a = item({ ordem: 1, data: null, dataOriginalTexto: '31/02', descricaoOriginal: 'X', valorCents: 100 });
    const b = item({ ordem: 2, data: null, dataOriginalTexto: '31/02', descricaoOriginal: 'X', valorCents: 100 });
    expect(chaveDeduplicacao(a)).toBe(chaveDeduplicacao(b));
  });
});
