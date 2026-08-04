/**
 * Porta do contador de uso da IA. Durável de propósito (TASKS-AUTH §6): um
 * teto de DINHEIRO não pode viver em memória, senão um loop de reinícios do
 * server o fura.
 *
 * As contagens são inteiros de CONTAGEM (requisições, tokens) — não são
 * dinheiro, por isso não levam sufixo `Cents`.
 */
import type { DataCivil } from '@/shared/data';

export interface UsoIADia {
  requisicoes: number;
  tokensEntrada: number;
  tokensSaida: number;
}

export interface UsoIARepository {
  /** Uso acumulado do dia; zeros quando ainda não houve chamada. */
  doDia(dia: DataCivil): Promise<UsoIADia>;
  /** Soma ao acumulado do dia, criando a linha se necessário (idempotente por dia). */
  incrementar(dia: DataCivil, uso: UsoIADia): Promise<void>;
}
