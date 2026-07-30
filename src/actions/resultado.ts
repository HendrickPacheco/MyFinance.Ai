/**
 * Contrato de retorno das server actions: sempre `{ ok }`, nunca exceção
 * vazando para a UI (SPEC 8).
 */
export type Resultado<T = void> = { ok: true; data: T } | { ok: false; erro: string };

export async function executar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Erro inesperado.';
    return { ok: false, erro };
  }
}
