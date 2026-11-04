/**
 * `?dryRun=true`: a resposta carrega `dryRun: true` + `impactoCiclo`, e NADA
 * é gravado (contagem de transações, saldo de conta e `Ciclo` continuam
 * exatamente como estavam). Cobre criação, DELETE e o fechamento de ciclo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hoje, ontem } from '@/shared/data';
import { POST as transacoesPost } from '../../../app/api/agent/v1/transacoes/route';
import { DELETE as transacaoDelete } from '../../../app/api/agent/v1/transacoes/[id]/route';
import { POST as fecharPost } from '../../../app/api/agent/v1/ciclos/atual/fechar/route';
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

describe('dryRun — simula e NUNCA grava', () => {
  let guardar: () => Promise<void>;
  let donoId: string;
  let contaVariavelId: string;
  let categoriaMercadoId: string;
  let token: string;

  beforeAll(async () => {
    guardar = await iniciarGuardaDeIsolamento();
    const dono = await criarDonoDeTeste('dryrun');
    donoId = dono.donoId;
    contaVariavelId = dono.contaVariavelId;
    categoriaMercadoId = dono.categoriaMercadoId;
    await prepararCicloAberto(donoId);
    ({ token } = await criarTokenDeTeste(donoId, ['admin']));
  });

  afterAll(async () => {
    await apagarDonoDeTeste(donoId);
    await guardar();
  });

  it('POST /transacoes?dryRun=true devolve dryRun:true + impactoCiclo e não grava nada', async () => {
    const transacoesAntes = await prisma.transacao.count({ where: { donoId } });
    const contaAntes = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });
    const auditoriaAntes = await prisma.auditoriaAgente.count({ where: { donoId } });

    // Datada de ONTEM (não hoje): `tetoHojeCents` exclui o gasto de HOJE por
    // design (SPEC 5.3) — uma despesa lançada hoje não moveria o ritmo diário
    // "antes vs. depois" no mesmo instante, e o teste ficaria sem sinal.
    const dataOntem = ontem(hoje('America/Bahia'));
    const req = montarRequisicao('POST', '/transacoes', {
      token,
      query: { dryRun: 'true' },
      body: { valorCents: 50_000, contaId: contaVariavelId, categoriaId: categoriaMercadoId, data: dataOntem },
    });
    const { status, corpo } = await chamarJson<{
      dryRun: boolean;
      transacao: { id: string };
      impactoCiclo: { ritmoDiarioAntesCents: number; ritmoDiarioDepoisCents: number } | null;
    }>(transacoesPost, req);

    expect(status).toBe(200); // dryRun nunca usa o status de criação (201)
    expect(corpo.dryRun).toBe(true);
    expect(corpo.transacao).toBeTruthy();
    expect(corpo.impactoCiclo).not.toBeNull();
    expect(corpo.impactoCiclo!.ritmoDiarioDepoisCents).toBeLessThan(
      corpo.impactoCiclo!.ritmoDiarioAntesCents,
    );

    const transacoesDepois = await prisma.transacao.count({ where: { donoId } });
    const contaDepois = await prisma.conta.findUniqueOrThrow({ where: { id: contaVariavelId } });
    expect(transacoesDepois).toBe(transacoesAntes);
    expect(contaDepois.saldoCents).toBe(contaAntes.saldoCents);

    // Auditoria É gravada no dryRun (fora da transação revertida), com a flag.
    const auditoriaDepois = await prisma.auditoriaAgente.count({ where: { donoId, dryRun: true } });
    expect(auditoriaDepois).toBeGreaterThan(0);
    const totalAuditoriaDepois = await prisma.auditoriaAgente.count({ where: { donoId } });
    expect(totalAuditoriaDepois).toBe(auditoriaAntes + 1);
  });

  it('DELETE /transacoes/{id}?dryRun=true não exclui a transação', async () => {
    const criar = await chamarJson<{ transacao: { id: string } }>(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', {
        token,
        body: { valorCents: 20_000, contaId: contaVariavelId },
      }),
    );
    const id = criar.corpo.transacao.id;

    const req = montarRequisicao('DELETE', `/transacoes/${id}`, {
      token,
      query: { dryRun: 'true' },
      body: {},
    });
    const { status, corpo } = await chamarJson<{ dryRun: boolean; excluida: boolean }>(
      transacaoDelete,
      req,
      { id },
    );
    expect(status).toBe(200);
    expect(corpo.dryRun).toBe(true);
    expect(corpo.excluida).toBe(true);

    const aindaExiste = await prisma.transacao.findUnique({ where: { id } });
    expect(aindaExiste).not.toBeNull();
  });

  it('POST /ciclos/atual/fechar?dryRun=true não fecha o ciclo nem move saldo', async () => {
    const cicloAntes = await prisma.ciclo.findMany({ where: { donoId } });
    const contaReservaAntes = await prisma.conta.findMany({ where: { donoId, tipo: 'RESERVA' } });

    const req = montarRequisicao('POST', '/ciclos/atual/fechar', {
      token,
      query: { dryRun: 'true' },
      body: { rendaRealizadaCents: 3_000_000, poupancaRealManualCents: 0 },
    });
    const { status, corpo } = await chamarJson<{ dryRun: boolean; ciclo: { fechado: boolean } }>(
      fecharPost,
      req,
    );
    expect(status).toBe(200);
    expect(corpo.dryRun).toBe(true);
    expect(corpo.ciclo.fechado).toBe(true); // o RESULTADO simulado mostra fechado...

    // ...mas nada persistiu: nenhum ciclo do dono ficou fechado de verdade,
    // e nenhuma conta RESERVA mudou de saldo.
    const ciclosDepois = await prisma.ciclo.findMany({ where: { donoId } });
    expect(ciclosDepois.every((c) => !c.fechado)).toBe(true);
    expect(ciclosDepois).toHaveLength(cicloAntes.length);

    const contaReservaDepois = await prisma.conta.findMany({ where: { donoId, tipo: 'RESERVA' } });
    expect(contaReservaDepois).toEqual(contaReservaAntes);
  });
});
