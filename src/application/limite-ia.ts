/**
 * Teto de custo da IA (TASKS-AUTH §6, vulnerabilidade V5).
 *
 * A camada de IA é a única do app que gasta DINHEIRO REAL por requisição. Sem
 * teto, uma sessão aberta (ou um bug de laço) vira uma fatura de API. A
 * política de decisão é PURA e testável; o contador é durável (Postgres).
 */
import type { DataCivil } from '@/shared/data';
import type { UsoIADia } from '@/domain/ports/uso-ia';

/**
 * Limites padrão, deliberadamente generosos para o uso humano de uma pessoa e
 * ainda assim muito abaixo de qualquer valor que assuste na fatura. Ajustáveis
 * por ambiente sem tocar em código de chamada.
 */
export const LIMITES_IA_PADRAO = {
  requisicoesPorDia: 50,
  tokensPorDia: 500_000,
} as const;

export interface LimitesIA {
  requisicoesPorDia: number;
  tokensPorDia: number;
}

export type VeredictoIA =
  | { permitido: true }
  | { permitido: false; motivo: string };

/**
 * Função PURA: decide, a partir do uso já acumulado no dia, se mais uma
 * chamada pode acontecer. Roda ANTES de falar com o provedor — é essa ordem
 * que economiza o dinheiro, não o registro depois.
 */
export function avaliarLimiteIA(
  uso: UsoIADia,
  limites: LimitesIA = LIMITES_IA_PADRAO,
): VeredictoIA {
  if (uso.requisicoes >= limites.requisicoesPorDia) {
    return {
      permitido: false,
      motivo: 'Limite diário de perguntas à IA atingido. Tente novamente amanhã.',
    };
  }

  if (uso.tokensEntrada + uso.tokensSaida >= limites.tokensPorDia) {
    return {
      permitido: false,
      motivo: 'Limite diário de uso da IA atingido. Tente novamente amanhã.',
    };
  }

  return { permitido: true };
}

/**
 * Contrato para quem implementar a action de IA (Fase D do TASKS-IA.md):
 *
 *   1. `exigirOwner(deps.ator)`   — IA é OWNER-only (decisão DA-3): custa
 *      dinheiro do dono, então VIEWER não dispara.
 *   2. `avaliarLimiteIA(await usoIA.doDia(hoje))` — se negar, responder
 *      `{ ok:false, erro }` SEM chamar o provedor.
 *   3. Depois de cada resposta, `usoIA.incrementar(hoje, { requisicoes: 1,
 *      tokensEntrada, tokensSaida })` com o `ResultadoTurno.consumo`.
 *
 * Sem os três passos, a action não passa na auditoria de segurança.
 */
export interface RegistroConsumoIA {
  dia: DataCivil;
  uso: UsoIADia;
}
