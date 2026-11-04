/**
 * `POST /ciclos/atual/fechar` (escopo admin): fecha o ciclo pendente/atual,
 * destina a sobra (conta recebe o valor / ROLLOVER fica só registrado) e o
 * ciclo seguinte nasce — mesmas regras que `src/application/fechamento.test.ts`
 * já assume, aqui exercitadas pelo route handler contra o Postgres real.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ontem, hoje } from '@/shared/data';
import { POST as fecharPost } from '../../../app/api/agent/v1/ciclos/atual/fechar/route';
import { POST as transacoesPost } from '../../../app/api/agent/v1/transacoes/route';
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

describe('POST /ciclos/atual/fechar', () => {
  let guardar: () => Promise<void>;

  beforeAll(async () => {
    guardar = await iniciarGuardaDeIsolamento();
  });

  afterAll(async () => {
    await guardar();
  });

  it('fecha o ciclo, credita a sobra na conta RESERVA configurada como destino', async () => {
    const dono = await criarDonoDeTeste('fechar-reserva');
    await prepararCicloAberto(dono.donoId, {
      rendaBaseCents: 3_000_000,
      destinoSobra: 'RESERVA',
      destinoSobraContaId: dono.contaReservaId,
    });
    const { token } = await criarTokenDeTeste(dono.donoId, ['admin']);

    // Um gasto conhecido para a sobra não ser só "a verba inteira".
    const dataOntem = ontem(hoje('America/Bahia'));
    await chamarJson(
      transacoesPost,
      montarRequisicao('POST', '/transacoes', {
        token,
        body: {
          valorCents: 200_000,
          contaId: dono.contaVariavelId,
          categoriaId: dono.categoriaMercadoId,
          data: dataOntem,
        },
      }),
    );

    const cicloAberto = await prisma.ciclo.findFirstOrThrow({ where: { donoId: dono.donoId, fechado: false } });
    const reservaAntes = await prisma.conta.findUniqueOrThrow({ where: { id: dono.contaReservaId } });

    const { status, corpo } = await chamarJson<{
      ciclo: { id: string; fechado: boolean; sobraCents: number };
      destinoSobra: { tipo: string; contaId: string | null };
    }>(
      fecharPost,
      montarRequisicao('POST', '/ciclos/atual/fechar', { token, body: { rendaRealizadaCents: 3_000_000 } }),
    );

    expect(status).toBe(200);
    expect(corpo.ciclo.id).toBe(cicloAberto.id);
    expect(corpo.ciclo.fechado).toBe(true);
    expect(corpo.destinoSobra.tipo).toBe('CONTA');
    expect(corpo.destinoSobra.contaId).toBe(dono.contaReservaId);

    const cicloNoBanco = await prisma.ciclo.findUniqueOrThrow({ where: { id: cicloAberto.id } });
    expect(cicloNoBanco.fechado).toBe(true);
    expect(cicloNoBanco.sobraCents).toBe(corpo.ciclo.sobraCents);

    const reservaDepois = await prisma.conta.findUniqueOrThrow({ where: { id: dono.contaReservaId } });
    expect(reservaDepois.saldoCents).toBe(reservaAntes.saldoCents + corpo.ciclo.sobraCents);

    // Fechar de novo é recusado (idempotência de negócio: não credita 2x).
    const segundaVez = await chamarJson(
      fecharPost,
      montarRequisicao('POST', '/ciclos/atual/fechar', { token, body: { rendaRealizadaCents: 3_000_000 } }),
    );
    expect(segundaVez.status).toBeGreaterThanOrEqual(400);

    await apagarDonoDeTeste(dono.donoId);
  });

  it('destino ROLLOVER: fecha sem mover saldo de conta nenhuma', async () => {
    const dono = await criarDonoDeTeste('fechar-rollover');
    await prepararCicloAberto(dono.donoId, { rendaBaseCents: 3_000_000, destinoSobra: 'ROLLOVER' });
    const { token } = await criarTokenDeTeste(dono.donoId, ['admin']);

    const contasAntes = await prisma.conta.findMany({ where: { donoId: dono.donoId } });

    const { status, corpo } = await chamarJson<{
      ciclo: { fechado: boolean; sobraCents: number };
      destinoSobra: { tipo: string };
    }>(
      fecharPost,
      montarRequisicao('POST', '/ciclos/atual/fechar', { token, body: { rendaRealizadaCents: 3_000_000 } }),
    );

    expect(status).toBe(200);
    expect(corpo.ciclo.fechado).toBe(true);
    expect(corpo.destinoSobra.tipo).toBe('ROLLOVER');

    const contasDepois = await prisma.conta.findMany({ where: { donoId: dono.donoId } });
    expect(contasDepois.map((c) => c.saldoCents)).toEqual(contasAntes.map((c) => c.saldoCents));

    await apagarDonoDeTeste(dono.donoId);
  });
});
