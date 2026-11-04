import { describe, expect, it } from 'vitest';
import { executarComPossivelDryRun } from './transacao';

/** Fake de transação: só chama o callback direto — sem Postgres, sem rollback real. */
async function transacaoFake<T>(fn: (tx: { chamada: true }) => Promise<T>): Promise<T> {
  return fn({ chamada: true });
}

describe('executarComPossivelDryRun', () => {
  it('sem dryRun: executa uma vez e devolve persistido=true', async () => {
    let chamadas = 0;
    const { resultado, persistido } = await executarComPossivelDryRun({
      dryRun: false,
      transacionar: transacaoFake,
      executar: async () => {
        chamadas += 1;
        return { id: 'x' };
      },
    });

    expect(chamadas).toBe(1);
    expect(persistido).toBe(true);
    expect(resultado).toEqual({ id: 'x' });
  });

  it('com dryRun: devolve persistido=false e o MESMO resultado que seria gravado', async () => {
    const { resultado, persistido } = await executarComPossivelDryRun({
      dryRun: true,
      transacionar: transacaoFake,
      executar: async () => ({ id: 'simulado' }),
    });

    expect(persistido).toBe(false);
    expect(resultado).toEqual({ id: 'simulado' });
  });

  it('erro real de `executar` propaga intacto, mesmo em dryRun (não é confundido com o sentinel)', async () => {
    await expect(
      executarComPossivelDryRun({
        dryRun: true,
        transacionar: transacaoFake,
        executar: async () => {
          throw new Error('regra de negócio violada');
        },
      }),
    ).rejects.toThrow('regra de negócio violada');
  });

  it('erro real de `executar` propaga intacto fora de dryRun', async () => {
    await expect(
      executarComPossivelDryRun({
        dryRun: false,
        transacionar: transacaoFake,
        executar: async () => {
          throw new Error('falhou de verdade');
        },
      }),
    ).rejects.toThrow('falhou de verdade');
  });

  it('passa o timeout (default ou explícito) para `transacionar`', async () => {
    let opcoesRecebidas: { timeout: number } | undefined;
    const transacaoQueCapturaOpcoes = async <T>(
      fn: (tx: unknown) => Promise<T>,
      opcoes?: { timeout: number },
    ): Promise<T> => {
      opcoesRecebidas = opcoes;
      return fn({});
    };

    await executarComPossivelDryRun({
      dryRun: false,
      transacionar: transacaoQueCapturaOpcoes,
      executar: async () => 'ok',
      timeoutMs: 5_000,
    });

    expect(opcoesRecebidas).toEqual({ timeout: 5_000 });
  });
});
