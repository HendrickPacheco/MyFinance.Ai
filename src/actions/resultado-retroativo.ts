/**
 * Contrato de retorno das server actions que podem tocar um ciclo fechado
 * (SPEC regra 9) — superset estrutural de `Resultado<T>` (`src/actions/resultado.ts`):
 * a UI que só olha `.ok`/`.erro` continua funcionando; quem trata
 * retroatividade lê `requerConfirmacao` e `ciclosAfetados` para pedir
 * confirmação e reenviar com o flag.
 *
 * Módulo SEM `'use server'` de propósito: `executarComConfirmacao` recebe uma
 * função como argumento, o que o compilador de server actions do Next.js
 * recusaria se este arquivo fosse uma action (argumentos de action precisam
 * ser serializáveis). `src/actions/transacoes.ts` e `src/actions/parcelamentos.ts`
 * — esses sim `'use server'` — importam o helper daqui em vez de duplicá-lo.
 */
import { CicloFechadoError } from '@/application/retroatividade';

export type ResultadoRetroativo<T = void> =
  | { ok: true; data: T }
  | { ok: false; erro: string; requerConfirmacao?: boolean; ciclosAfetados?: string[] };

/**
 * Como `executar` (`src/actions/resultado.ts`), mas reconhece
 * `CicloFechadoError` por `instanceof` e traduz em pedido de confirmação —
 * nunca deixa a exceção vazar como erro genérico para a UI (SPEC 8).
 */
export async function executarComConfirmacao<T>(fn: () => Promise<T>): Promise<ResultadoRetroativo<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof CicloFechadoError) {
      return {
        ok: false,
        erro: e.message,
        requerConfirmacao: true,
        ciclosAfetados: [...e.ciclosAfetados],
      };
    }
    const erro = e instanceof Error ? e.message : 'Erro inesperado.';
    return { ok: false, erro };
  }
}
