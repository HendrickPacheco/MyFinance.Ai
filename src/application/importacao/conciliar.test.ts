/**
 * Testes de `conciliarImportacao` (I3, onda 2). Cobrem exatamente as
 * garantias do cabeçalho: idempotência de duas camadas (hash já
 * rascunhado não re-extrai; hash já confirmado devolve o aviso), tradução
 * do veredito para a linha achatada (com a trava do R1: `CASA_CUSTO_FIXO`
 * nunca aponta para `TRANSACAO`), toda linha nasce `PENDENTE`, o agrupamento
 * por faixa reflete o que `conciliarFatura` decidiu, e o total devolvido é a
 * soma das linhas.
 *
 * Nenhuma chamada real de API (tudo sobre `FakeProvedorIA`) e nenhum banco
 * (tudo sobre os fakes em memória de `fakes-ciclo-fechamento.ts`).
 */
import { describe, expect, it } from 'vitest';
import {
  ATOR_VIEWER,
  cicloFake,
  criarDeps,
  transacaoFake,
} from '../__fakes__/fakes-ciclo-fechamento';
import { FakeProvedorIA } from '../__fakes__/fake-provedor-ia';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import type { CustoFixo } from '@/domain/model/entidades';
import { formatBRL } from '@/shared/dinheiro';
import { conciliarImportacao } from './conciliar';

/** Item mínimo válido contra `ITEM_TRANSCRITO_SCHEMA` (mesmo shape de `extrair.test.ts`). */
function itemTranscrito(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    descricaoOriginal: 'ESTABELECIMENTO GENERICO',
    valorCents: 1000,
    sinal: 'COMPRA',
    dataOriginalTexto: '10/07',
    parcelaAtual: null,
    parcelaTotal: null,
    confianca: 'ALTA',
    ...overrides,
  };
}

const CUSTO_FIXO_NETFLIX: CustoFixo = {
  id: 'cf-netflix',
  nome: 'Netflix',
  valorCents: 3990,
  diaVencimento: 10,
  ativo: true,
  contaId: null,
  categoriaId: null,
  vigenteDe: null,
  vigenteAte: null,
};

/**
 * Cenário com as cinco faixas representadas, mais uma linha rejeitada (data
 * ilegível): já registrado (casa com transação existente), custo fixo
 * reconhecido, novo sem ambiguidade, dois ignorados (pagamento de fatura e
 * estorno órfão) e uma que a conciliação pura recusa a interpretar.
 */
const ITENS_DO_CENARIO = [
  itemTranscrito({ descricaoOriginal: 'PADARIA DO ZE', valorCents: 5000, dataOriginalTexto: '08/07' }),
  itemTranscrito({ descricaoOriginal: 'NETFLIX COM', valorCents: 3990, dataOriginalTexto: '10/07' }),
  itemTranscrito({ descricaoOriginal: 'LOJA XYZ', valorCents: 12345, dataOriginalTexto: '15/07' }),
  itemTranscrito({ descricaoOriginal: 'PAGAMENTO RECEBIDO', valorCents: 500_000, sinal: 'PAGAMENTO_FATURA', dataOriginalTexto: '05/07' }),
  itemTranscrito({ descricaoOriginal: 'ESTORNO LOJA', valorCents: 2000, sinal: 'ESTORNO', dataOriginalTexto: '06/07' }),
  itemTranscrito({ descricaoOriginal: 'ILEGIVEL', valorCents: 999, dataOriginalTexto: 'texto sem formato de data' }),
];

const TOTAL_GERAL_DO_CENARIO = 5000 + 3990 + 12345 + 500_000 + 2000 + 999;

function depsDoCenario() {
  const d = criarDeps({
    hoje: '2026-07-20',
    ciclos: [cicloFake({ id: 'ciclo-x', dataInicio: '2026-07-05', dataFim: '2026-08-04', fechado: false })],
    custosFixos: [CUSTO_FIXO_NETFLIX],
    transacoes: [
      transacaoFake({
        id: 'tx-existente',
        data: '2026-07-08',
        valorCents: 5000,
        descricao: 'PADARIA DO ZE',
        cicloId: 'ciclo-x',
      }),
    ],
  });
  const ia = new FakeProvedorIA();
  ia.programarSchema({ tipo: 'DADOS', dados: { itens: ITENS_DO_CENARIO } });
  d.ia = ia;
  return { d, ia };
}

function entradaDoCenario(overrides: Partial<Parameters<typeof conciliarImportacao>[1]> = {}) {
  return {
    texto: 'seis linhas de fatura',
    hashConteudo: 'hash-fatura-julho',
    competenciaRef: '2026-07',
    origem: 'TEXTO_COLADO' as const,
    nomeArquivo: null,
    ...overrides,
  };
}

describe('conciliarImportacao', () => {
  it('recusa VIEWER antes de qualquer I/O', async () => {
    const { d } = depsDoCenario();
    d.ator = ATOR_VIEWER;

    await expect(conciliarImportacao(d, entradaDoCenario())).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it('concilia o cenário completo: faixas corretas, custo fixo nunca vira TRANSACAO, tudo PENDENTE', async () => {
    const { d } = depsDoCenario();

    const resultado = await conciliarImportacao(d, entradaDoCenario());
    if (resultado.tipo !== 'RASCUNHO') throw new Error('esperava RASCUNHO na primeira importação');

    expect(resultado.itens).toHaveLength(6);
    expect(resultado.itens.every((item) => item.decisao === 'PENDENTE')).toBe(true);

    // Faixa 1 — já registrado (casa com a transação existente).
    expect(resultado.resumo.jaRegistrado).toEqual({ quantidade: 1, totalCents: 5000, totalFormatado: formatBRL(5000) });
    const jaRegistrado = resultado.itens.find((i) => i.veredito === 'CASA_VARIAVEL');
    expect(jaRegistrado?.alvoTipo).toBe('TRANSACAO');
    expect(jaRegistrado?.alvoId).toBe('tx-existente');

    // Faixa 2 — custo fixo reconhecido: 🔴 alvoTipo é CUSTO_FIXO, NUNCA TRANSACAO (R1).
    expect(resultado.resumo.custoFixoReconhecido).toEqual({
      quantidade: 1,
      totalCents: 3990,
      totalFormatado: formatBRL(3990),
    });
    const custoFixoReconhecido = resultado.itens.find((i) => i.veredito === 'CASA_CUSTO_FIXO');
    expect(custoFixoReconhecido?.alvoTipo).toBe('CUSTO_FIXO');
    expect(custoFixoReconhecido?.alvoId).toBe('cf-netflix');

    // Faixa 3 — novo, sem ambiguidade.
    expect(resultado.resumo.novo).toEqual({ quantidade: 1, totalCents: 12345, totalFormatado: formatBRL(12345) });

    // Faixa 4 — precisa de você: a linha com data ilegível, rejeitada pela função pura.
    expect(resultado.resumo.precisaDeVoce).toEqual({ quantidade: 1, totalCents: 999, totalFormatado: formatBRL(999) });
    const rejeitada = resultado.itens.find((i) => i.descricaoOriginal === 'ILEGIVEL');
    // `REJEITADA`, e não `AMBIGUA`: a linha ilegível tem nome próprio no banco.
    // Dobrá-la em `AMBIGUA` faria "quantas ficaram ambíguas?" somar ambiguidade
    // de casamento com falha do extrator — problemas com conserto diferente.
    expect(rejeitada?.veredito).toBe('REJEITADA');
    expect(rejeitada?.data).toBeNull();
    expect(rejeitada?.vereditoMotivo.length).toBeGreaterThan(0);

    // Faixa 5 — ignorados: pagamento de fatura + estorno órfão.
    expect(resultado.resumo.ignorado).toEqual({ quantidade: 2, totalCents: 502_000, totalFormatado: formatBRL(502_000) });

    // Nenhum motivo vazio (D-14).
    expect(resultado.itens.every((item) => item.vereditoMotivo.trim().length > 0)).toBe(true);

    // Total devolvido é a soma das linhas.
    expect(resultado.totalGeralCents).toBe(TOTAL_GERAL_DO_CENARIO);
    expect(resultado.totalGeralCents).toBe(resultado.itens.reduce((soma, item) => soma + item.valorCents, 0));

    // 🔴 R1: nada foi gravado em Transacao/PagamentoFixo por este caso de uso.
    expect(d.transacoes.itens).toHaveLength(1);
    expect(d.pagamentosFixos.itens).toHaveLength(0);
  });

  it('reenviar o mesmo hash não re-extrai e devolve o rascunho existente', async () => {
    const { d, ia } = depsDoCenario();

    const primeira = await conciliarImportacao(d, entradaDoCenario());
    if (primeira.tipo !== 'RASCUNHO') throw new Error('esperava RASCUNHO');
    expect(ia.chamadasDeSchema).toHaveLength(1);

    const segunda = await conciliarImportacao(d, entradaDoCenario());

    expect(ia.chamadasDeSchema).toHaveLength(1); // nenhuma chamada nova ao provedor
    if (segunda.tipo !== 'RASCUNHO') throw new Error('esperava RASCUNHO no reenvio');
    expect(segunda.importacaoId).toBe(primeira.importacaoId);
    expect(segunda.itens).toHaveLength(primeira.itens.length);
  });

  it('hash de importação já confirmada devolve o aviso em vez de reabrir', async () => {
    const { d, ia } = depsDoCenario();

    const rascunho = await conciliarImportacao(d, entradaDoCenario());
    if (rascunho.tipo !== 'RASCUNHO') throw new Error('esperava RASCUNHO');
    await d.importacoes.marcarConfirmada(rascunho.importacaoId);

    const resultado = await conciliarImportacao(d, entradaDoCenario());

    expect(ia.chamadasDeSchema).toHaveLength(1); // seguiu sem re-extrair
    expect(resultado).toEqual({
      tipo: 'JA_CONFIRMADA',
      importacaoId: rascunho.importacaoId,
      mensagem: expect.stringContaining('já foi importada') as unknown as string,
      quantidadeItens: 6,
    });
  });

  it('duas faturas com hashes diferentes geram dois rascunhos independentes', async () => {
    const { d, ia } = depsDoCenario();
    ia.programarSchema({ tipo: 'DADOS', dados: { itens: ITENS_DO_CENARIO } });

    const primeira = await conciliarImportacao(d, entradaDoCenario({ hashConteudo: 'hash-a' }));
    const segunda = await conciliarImportacao(d, entradaDoCenario({ hashConteudo: 'hash-b' }));

    expect(ia.chamadasDeSchema).toHaveLength(2);
    if (primeira.tipo !== 'RASCUNHO' || segunda.tipo !== 'RASCUNHO') {
      throw new Error('esperava RASCUNHO nas duas');
    }
    expect(primeira.importacaoId).not.toBe(segunda.importacaoId);
  });
});
