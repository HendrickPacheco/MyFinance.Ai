/**
 * Núcleo do `?dryRun=true`: roda `executar` dentro de uma transação e, se
 * `dryRun`, força o ROLLBACK lançando um sentinel que carrega o resultado —
 * nada persiste, mas quem chamou recebe exatamente o que teria sido gravado.
 *
 * Depende de `transacionar` por injeção (nunca importa Prisma aqui) — é o
 * que torna isto testável com um fake que só invoca o callback direto, sem
 * banco nenhum (`transacao.test.ts`).
 */

class RollbackSimulado<T> extends Error {
  constructor(public readonly resultado: T) {
    super('rollback simulado de dryRun — nunca deveria escapar deste módulo');
    this.name = 'RollbackSimulado';
  }
}

export interface ResultadoComPersistencia<T> {
  resultado: T;
  /** `false` quando foi um `dryRun`: a transação foi revertida de propósito. */
  persistido: boolean;
}

export interface ParametrosDryRun<T, Tx> {
  dryRun: boolean;
  transacionar: (fn: (tx: Tx) => Promise<T>, opcoes?: { timeout: number }) => Promise<T>;
  executar: (tx: Tx) => Promise<T>;
  /** Generoso de propósito (rotas de escrita podem encadear vários casos de uso). */
  timeoutMs?: number;
}

const TIMEOUT_PADRAO_MS = 20_000;

export async function executarComPossivelDryRun<T, Tx = unknown>(
  params: ParametrosDryRun<T, Tx>,
): Promise<ResultadoComPersistencia<T>> {
  const opcoes = { timeout: params.timeoutMs ?? TIMEOUT_PADRAO_MS };

  if (!params.dryRun) {
    const resultado = await params.transacionar(params.executar, opcoes);
    return { resultado, persistido: true };
  }

  try {
    await params.transacionar(async (tx) => {
      const resultado = await params.executar(tx);
      // Força o rollback: um erro real de `executar` (validação, regra de
      // negócio) se propaga normalmente e NUNCA chega a este `throw` —
      // só o sentinel chega aqui, com o resultado que teria sido gravado.
      throw new RollbackSimulado(resultado);
    }, opcoes);
  } catch (erro) {
    if (erro instanceof RollbackSimulado) {
      return { resultado: erro.resultado as T, persistido: false };
    }
    throw erro;
  }

  // Inalcançável: o callback do `try` sempre lança (sentinel ou erro real).
  throw new Error('dryRun: a transação terminou sem lançar o sentinel de rollback (bug no executor).');
}
