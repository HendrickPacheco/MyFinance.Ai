/**
 * Isolamento entre donos NA BORDA HTTP da API do agente: o token do dono A
 * nunca alcança (leitura, edição ou exclusão) nada que pertença ao dono B —
 * nem por listagem, nem por id direto na URL, nem por `donoId` escondido no
 * corpo. Complementa `scripts/verificar-isolamento.ts` (que prova a mesma
 * garantia na camada de repositório); aqui a prova é através do route
 * handler de verdade, com token + JSON, exatamente como o agente chamaria.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GET as transacoesGet } from '../../../app/api/agent/v1/transacoes/route';
import { GET as transacaoGet, PATCH as transacaoPatch, DELETE as transacaoDelete } from '../../../app/api/agent/v1/transacoes/[id]/route';
import { PATCH as custoFixoPatch, DELETE as custoFixoDelete } from '../../../app/api/agent/v1/custos-fixos/[id]/route';
import { PATCH as contaPatch } from '../../../app/api/agent/v1/contas/[id]/route';
import { GET as parcelamentoGet, PATCH as parcelamentoPatch } from '../../../app/api/agent/v1/parcelamentos/[id]/route';
import { PATCH as provisaoPatch, DELETE as provisaoDelete } from '../../../app/api/agent/v1/provisoes/[id]/route';
import { PATCH as categoriaPatch } from '../../../app/api/agent/v1/categorias/[id]/route';
import { GET as importacaoGet } from '../../../app/api/agent/v1/importacao/[id]/route';
import { GET as auditoriaGet } from '../../../app/api/agent/v1/auditoria/route';
import {
  criarDonoDeTeste,
  criarTokenDeTeste,
  apagarDonoDeTeste,
  montarRequisicao,
  chamarJson,
  iniciarGuardaDeIsolamento,
  prisma,
} from './helpers';

describe('isolamento entre donos (borda HTTP)', () => {
  let guardar: () => Promise<void>;
  let a: Awaited<ReturnType<typeof criarDonoDeTeste>>;
  let b: Awaited<ReturnType<typeof criarDonoDeTeste>>;
  let tokenA: string;

  // Recursos de B que A vai tentar alcançar.
  let txB: { id: string };
  let custoFixoB: { id: string };
  let provisaoB: { id: string };
  let parcelamentoB: { id: string };
  let categoriaB: { id: string };
  let importacaoB: { id: string };

  beforeAll(async () => {
    guardar = await iniciarGuardaDeIsolamento();
    a = await criarDonoDeTeste('isolA');
    b = await criarDonoDeTeste('isolB');
    ({ token: tokenA } = await criarTokenDeTeste(a.donoId, ['admin']));

    txB = await prisma.transacao.create({
      data: {
        donoId: b.donoId,
        data: '2026-09-10',
        valorCents: 12_345,
        tipo: 'DESPESA',
        descricao: 'segredo do dono B',
        contaId: b.contaVariavelId,
      },
    });
    custoFixoB = await prisma.custoFixo.create({
      data: { donoId: b.donoId, nome: 'Aluguel secreto do B', valorCents: 200_000, diaVencimento: 5 },
    });
    provisaoB = await prisma.provisaoAnual.create({
      data: { donoId: b.donoId, nome: 'IPVA do B', valorAnualCents: 120_000, acumuladoCents: 10_000 },
    });
    const parcelasB = await prisma.$transaction(
      Array.from({ length: 2 }, (_, i) =>
        prisma.transacao.create({
          data: {
            donoId: b.donoId,
            data: '2026-09-03',
            valorCents: 50_000,
            tipo: 'DESPESA',
            descricao: 'Notebook do B',
            parcelaNum: i + 1,
          },
        }),
      ),
    );
    const parcelamentoCriado = await prisma.parcelamento.create({
      data: {
        donoId: b.donoId,
        descricao: 'Notebook do B',
        valorTotalCents: 100_000,
        numParcelas: 2,
        dataCompra: '2026-09-03',
      },
    });
    await prisma.transacao.updateMany({
      where: { id: { in: parcelasB.map((t) => t.id) } },
      data: { parcelamentoId: parcelamentoCriado.id },
    });
    parcelamentoB = parcelamentoCriado;
    categoriaB = { id: b.categoriaMercadoId };
    importacaoB = await prisma.importacao.create({
      data: {
        donoId: b.donoId,
        origem: 'TEXTO_COLADO',
        hashConteudo: 'sha256-fatura-secreta-do-b',
        competenciaRef: '2026-09',
        status: 'RASCUNHO',
      },
    });
  });

  afterAll(async () => {
    await apagarDonoDeTeste(a.donoId);
    await apagarDonoDeTeste(b.donoId);
    await guardar();
  });

  it('GET /transacoes do A não lista a transação do B', async () => {
    const { corpo } = await chamarJson<{ transacoes: { id: string }[] }>(
      transacoesGet,
      montarRequisicao('GET', '/transacoes', { token: tokenA }),
    );
    expect(corpo.transacoes.some((t) => t.id === txB.id)).toBe(false);
  });

  it('GET /transacoes/{idDeB} pelo A -> 404', async () => {
    const { status } = await chamarJson(
      transacaoGet,
      montarRequisicao('GET', `/transacoes/${txB.id}`, { token: tokenA }),
      { id: txB.id },
    );
    expect(status).toBe(404);
  });

  it('PATCH /transacoes/{idDeB} pelo A -> 404 e a transação de B não muda', async () => {
    const { status } = await chamarJson(
      transacaoPatch,
      montarRequisicao('PATCH', `/transacoes/${txB.id}`, {
        token: tokenA,
        body: { valorCents: 1, donoId: a.donoId },
      }),
      { id: txB.id },
    );
    expect(status).toBe(404);
    const aindaB = await prisma.transacao.findUniqueOrThrow({ where: { id: txB.id } });
    expect(aindaB.valorCents).toBe(12_345);
    expect(aindaB.donoId).toBe(b.donoId); // "donoId" no corpo foi ignorado (campo nem existe no schema)
  });

  it('DELETE /transacoes/{idDeB} pelo A -> 404 e a transação de B continua existindo', async () => {
    const { status } = await chamarJson(
      transacaoDelete,
      montarRequisicao('DELETE', `/transacoes/${txB.id}`, { token: tokenA, body: {} }),
      { id: txB.id },
    );
    expect(status).toBe(404);
    expect(await prisma.transacao.findUnique({ where: { id: txB.id } })).not.toBeNull();
  });

  it('PATCH /custos-fixos/{idDeB} pelo A -> 404 e o custo de B não muda', async () => {
    const { status } = await chamarJson(
      custoFixoPatch,
      montarRequisicao('PATCH', `/custos-fixos/${custoFixoB.id}`, {
        token: tokenA,
        body: { valorCents: 1 },
      }),
      { id: custoFixoB.id },
    );
    expect(status).toBe(404);
    expect((await prisma.custoFixo.findUniqueOrThrow({ where: { id: custoFixoB.id } })).valorCents).toBe(
      200_000,
    );
  });

  it('DELETE /custos-fixos/{idDeB} pelo A -> 404 e o custo de B continua existindo', async () => {
    const { status } = await chamarJson(
      custoFixoDelete,
      montarRequisicao('DELETE', `/custos-fixos/${custoFixoB.id}`, { token: tokenA }),
      { id: custoFixoB.id },
    );
    expect(status).toBe(404);
    expect(await prisma.custoFixo.findUnique({ where: { id: custoFixoB.id } })).not.toBeNull();
  });

  it('PATCH /contas/{idDeB} pelo A -> 404', async () => {
    const { status } = await chamarJson(
      contaPatch,
      montarRequisicao('PATCH', `/contas/${b.contaVariavelId}`, { token: tokenA, body: { nome: 'invadida' } }),
      { id: b.contaVariavelId },
    );
    expect(status).toBe(404);
    expect((await prisma.conta.findUniqueOrThrow({ where: { id: b.contaVariavelId } })).nome).not.toBe(
      'invadida',
    );
  });

  it('GET /parcelamentos/{idDeB} pelo A -> 404', async () => {
    const { status } = await chamarJson(
      parcelamentoGet,
      montarRequisicao('GET', `/parcelamentos/${parcelamentoB.id}`, { token: tokenA }),
      { id: parcelamentoB.id },
    );
    expect(status).toBe(404);
  });

  it('PATCH /parcelamentos/{idDeB} pelo A -> 404 e o parcelamento de B não muda', async () => {
    const { status } = await chamarJson(
      parcelamentoPatch,
      montarRequisicao('PATCH', `/parcelamentos/${parcelamentoB.id}`, {
        token: tokenA,
        body: { descricao: 'invadido' },
      }),
      { id: parcelamentoB.id },
    );
    expect(status).toBe(404);
    expect((await prisma.parcelamento.findUniqueOrThrow({ where: { id: parcelamentoB.id } })).descricao).toBe(
      'Notebook do B',
    );
  });

  it('PATCH /provisoes/{idDeB} pelo A -> 404 e a provisão de B não muda', async () => {
    const { status } = await chamarJson(
      provisaoPatch,
      montarRequisicao('PATCH', `/provisoes/${provisaoB.id}`, { token: tokenA, body: { acumuladoCents: 1 } }),
      { id: provisaoB.id },
    );
    expect(status).toBe(404);
    expect((await prisma.provisaoAnual.findUniqueOrThrow({ where: { id: provisaoB.id } })).acumuladoCents).toBe(
      10_000,
    );
  });

  it('DELETE /provisoes/{idDeB} pelo A -> 404 e a provisão de B continua existindo', async () => {
    const { status } = await chamarJson(
      provisaoDelete,
      montarRequisicao('DELETE', `/provisoes/${provisaoB.id}`, { token: tokenA }),
      { id: provisaoB.id },
    );
    expect(status).toBe(404);
    expect(await prisma.provisaoAnual.findUnique({ where: { id: provisaoB.id } })).not.toBeNull();
  });

  it('PATCH /categorias/{idDeB} pelo A -> 404 e a categoria de B não muda', async () => {
    const { status } = await chamarJson(
      categoriaPatch,
      montarRequisicao('PATCH', `/categorias/${categoriaB.id}`, { token: tokenA, body: { nome: 'invadida' } }),
      { id: categoriaB.id },
    );
    expect(status).toBe(404);
    expect((await prisma.categoria.findUniqueOrThrow({ where: { id: categoriaB.id } })).nome).toBe('Mercado');
  });

  it('GET /importacao/{idDeB} pelo A -> 404', async () => {
    const { status } = await chamarJson(
      importacaoGet,
      montarRequisicao('GET', `/importacao/${importacaoB.id}`, { token: tokenA }),
      { id: importacaoB.id },
    );
    expect(status).toBe(404);
  });

  it('GET /auditoria do A não traz nenhuma entrada do B', async () => {
    // Gera ao menos uma entrada de auditoria para B (a própria tentativa de
    // PATCH acima é auditada? não — falhou antes de chegar no handler. Cria
    // uma transação de verdade para B produzir auditoria própria).
    const { tokenId: tokenIdB } = await criarTokenDeTeste(b.donoId, ['write']);
    await prisma.auditoriaAgente.create({
      data: {
        donoId: b.donoId,
        tokenId: tokenIdB,
        metodo: 'POST',
        rota: '/api/agent/v1/transacoes',
        entidade: 'Transacao',
        entidadeId: txB.id,
        acao: 'CREATE',
        depois: { segredo: 'do dono B' },
      },
    });

    const { corpo } = await chamarJson<{ auditoria: { donoId?: string; entidadeId: string | null }[] }>(
      auditoriaGet,
      montarRequisicao('GET', '/auditoria', { token: tokenA, query: { limite: '100' } }),
    );
    expect(corpo.auditoria.some((r) => r.entidadeId === txB.id)).toBe(false);
  });
});
