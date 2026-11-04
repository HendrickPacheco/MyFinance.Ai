/**
 * CRUD de transação recalcula o ciclo de ponta a ponta: criar reduz
 * verba/teto (via `impactoCiclo` e `GET /contexto`), editar ajusta, excluir
 * devolve; o saldo da conta acompanha em todos os casos. Cobre também
 * transferência, estorno e o lote "tudo ou nada".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ontem, hoje } from '@/shared/data';
import { GET as contextoGet } from '../../../app/api/agent/v1/contexto/route';
import { POST as transacoesPost } from '../../../app/api/agent/v1/transacoes/route';
import { PATCH as transacaoPatch, DELETE as transacaoDelete } from '../../../app/api/agent/v1/transacoes/[id]/route';
import { POST as estornarPost } from '../../../app/api/agent/v1/transacoes/[id]/estornar/route';
import { POST as lotePost } from '../../../app/api/agent/v1/transacoes/lote/route';
import {
  criarDonoDeTeste,
  criarTokenDeTeste,
  apagarDonoDeTeste,
  prepararCicloAberto,
  montarRequisicao,
  chamarJson,
  iniciarGuardaDeIsolamento,
  prisma,
} from './helpers';

async function gastoRealizadoAgora(token: string): Promise<number> {
  const { corpo } = await chamarJson<{ ciclo: { gastoRealizadoCents: number } | null }>(
    contextoGet,
    montarRequisicao('GET', '/contexto', { token }),
  );
  return corpo.ciclo?.gastoRealizadoCents ?? 0;
}

describe('transações: CRUD recalcula o ciclo de ponta a ponta', () => {
  let guardar: () => Promise<void>;
  let donoId: string;
  let contaVariavelId: string;
  let contaReservaId: string;
  let categoriaMercadoId: string;
  let token: string;
  const dataOntem = ontem(hoje('America/Bahia'));

  beforeAll(async () => {
    guardar = await iniciarGuardaDeIsolamento();
    const dono = await criarDonoDeTeste('crud');
    donoId = dono.donoId;
    contaVariavelId = dono.contaVariavelId;
    contaReservaId = dono.contaReservaId;
    categoriaMercadoId = dono.categoriaMercadoId;
    await prepararCicloAberto(donoId);
    ({ token } = await criarTokenDeTeste(donoId, ['admin']));
  });

  afterAll(async () => {
    await apagarDonoDeTeste(donoId);
    await guardar();
  });

  it('criar DESPESA reduz o gasto realizado do ciclo e debita a conta', async () => {
    const gastoAntes = await gastoRealizadoAgora(token);
    const contaAntes = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });

    const criar = await chamarJson<{
      transacao: { id: string };
      impactoCiclo: { ritmoDiarioAntesCents: number; ritmoDiarioDepoisCents: number };
    }>(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', {
        token,
        body: {
          valorCents: 80_000,
          contaId: contaVariavelId,
          categoriaId: categoriaMercadoId,
          data: dataOntem,
          descricao: 'mercado da semana',
        },
      }),
    );
    expect(criar.status).toBe(201);
    expect(criar.corpo.impactoCiclo.ritmoDiarioDepoisCents).toBeLessThan(
      criar.corpo.impactoCiclo.ritmoDiarioAntesCents,
    );
    const id = criar.corpo.transacao.id;

    const gastoDepois = await gastoRealizadoAgora(token);
    expect(gastoDepois).toBe(gastoAntes + 80_000);

    const contaDepois = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });
    expect(contaDepois.saldoCents).toBe(contaAntes.saldoCents - 80_000);

    // ── editar: dobra o valor, gasto e saldo acompanham ──
    const editar = await chamarJson<{ transacao: { id: string; valorCents: number } }>(
      transacaoPatch,
      montarRequisicao('PATCH', `/transacoes/${id}`, {
        token,
        body: { valorCents: 150_000, contaId: contaVariavelId, categoriaId: categoriaMercadoId, data: dataOntem },
      }),
      { id },
    );
    expect(editar.status).toBe(200);
    expect(editar.corpo.transacao.valorCents).toBe(150_000);

    const gastoAposEditar = await gastoRealizadoAgora(token);
    expect(gastoAposEditar).toBe(gastoAntes + 150_000);
    const contaAposEditar = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });
    expect(contaAposEditar.saldoCents).toBe(contaAntes.saldoCents - 150_000);

    // ── excluir: devolve tudo (gasto e saldo voltam ao que eram antes) ──
    const excluir = await chamarJson<{ excluida: boolean }>(
      transacaoDelete,
      montarRequisicao('DELETE', `/transacoes/${id}`, { token, body: {} }),
      { id },
    );
    expect(excluir.status).toBe(200);
    expect(excluir.corpo.excluida).toBe(true);

    const gastoFinal = await gastoRealizadoAgora(token);
    expect(gastoFinal).toBe(gastoAntes);
    const contaFinal = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });
    expect(contaFinal.saldoCents).toBe(contaAntes.saldoCents);
  });

  it('TRANSFERENCIA move saldo de uma conta para outra sem afetar o gasto do ciclo', async () => {
    const gastoAntes = await gastoRealizadoAgora(token);
    const origemAntes = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });
    const destinoAntes = await prisma.conta.findUniqueOrThrow({ where: { id: contaReservaId } });

    const { status, corpo } = await chamarJson<{ transacao: { id: string } }>(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', {
        token,
        body: {
          valorCents: 30_000,
          tipo: 'TRANSFERENCIA',
          contaId: contaVariavelId,
          contaDestinoId: contaReservaId,
        },
      }),
    );
    expect(status).toBe(201);

    const origemDepois = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });
    const destinoDepois = await prisma.conta.findUniqueOrThrow({ where: { id: contaReservaId } });
    expect(origemDepois.saldoCents).toBe(origemAntes.saldoCents - 30_000);
    expect(destinoDepois.saldoCents).toBe(destinoAntes.saldoCents + 30_000);
    expect(await gastoRealizadoAgora(token)).toBe(gastoAntes); // transferência não é gasto (regra 5/D-11 context)

    await chamarJson(
      transacaoDelete,
      montarRequisicao('DELETE', `/transacoes/${corpo.transacao.id}`, { token, body: {} }),
      { id: corpo.transacao.id },
    );
  });

  it('ESTORNO devolve o valor à conta e abate o gasto do ciclo', async () => {
    const original = await chamarJson<{ transacao: { id: string } }>(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', {
        token,
        body: { valorCents: 60_000, contaId: contaVariavelId, categoriaId: categoriaMercadoId, data: dataOntem },
      }),
    );
    const idOriginal = original.corpo.transacao.id;
    const gastoAntesDoEstorno = await gastoRealizadoAgora(token);
    const contaAntesDoEstorno = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });

    const estorno = await chamarJson<{ estorno: { id: string; tipo: string } }>(
      estornarPost,
      montarRequisicao('POST', `/transacoes/${idOriginal}/estornar`, { token, body: {} }),
      { id: idOriginal },
    );
    expect(estorno.status).toBe(201);
    expect(estorno.corpo.estorno.tipo).toBe('ESTORNO');

    const contaDepoisDoEstorno = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });
    expect(contaDepoisDoEstorno.saldoCents).toBe(contaAntesDoEstorno.saldoCents + 60_000);
    expect(await gastoRealizadoAgora(token)).toBe(gastoAntesDoEstorno - 60_000);
  });

  it('lote: um item inválido no meio -> nada é gravado e details.indice aponta o item certo', async () => {
    const transacoesAntes = await prisma.transacao.count({ where: { donoId } });

    const { status, corpo } = await chamarJson<{ error: { code: string; details: { indice: number } } }>(
      lotePost,
      montarRequisicao('POST', '/transacoes/lote', {
        token,
        body: {
          transacoes: [
            { valorCents: 10_000, contaId: contaVariavelId, descricao: 'item 0 válido' },
            { valorCents: 20_000, contaId: 'conta-que-nao-existe-nesse-dono', descricao: 'item 1 inválido' },
            { valorCents: 30_000, contaId: contaVariavelId, descricao: 'item 2 válido' },
          ],
        },
      }),
    );

    expect(status).toBeGreaterThanOrEqual(400);
    expect(corpo.error.details.indice).toBe(1);

    const transacoesDepois = await prisma.transacao.count({ where: { donoId } });
    expect(transacoesDepois).toBe(transacoesAntes); // tudo ou nada — o item 0, que teria sido gravado, também reverteu
  });

  it('lote: todos válidos -> todas as transações nascem no mesmo dono', async () => {
    const { status, corpo } = await chamarJson<{ transacoes: { id: string }[] }>(
      lotePost,
      montarRequisicao('POST', '/transacoes/lote', {
        token,
        body: {
          transacoes: [
            { valorCents: 1_111, contaId: contaVariavelId, descricao: 'lote ok 1' },
            { valorCents: 2_222, contaId: contaVariavelId, descricao: 'lote ok 2' },
          ],
        },
      }),
    );
    expect(status).toBe(201);
    expect(corpo.transacoes).toHaveLength(2);
    for (const t of corpo.transacoes) {
      expect((await prisma.transacao.findUniqueOrThrow({ where: { id: t.id } })).donoId).toBe(donoId);
    }
  });
});
