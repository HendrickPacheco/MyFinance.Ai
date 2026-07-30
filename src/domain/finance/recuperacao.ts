/**
 * Modo recuperação (SPEC 5.4). Quando o saldo disponível zera ou fica
 * negativo, o app NÃO mostra teto negativo, nem R$ 0,00 sem contexto, nem
 * mensagem de culpa. Mostra o déficit e duas saídas concretas com números.
 */
import { assertCentavos } from '@/shared/dinheiro';

export interface EntradaRecuperacao {
  saldoDisponivelCents: number;
  diasRestantes: number;
}

export interface SaidaRecuperacao {
  emRecuperacao: boolean;
  /** Módulo do saldo negativo — o tamanho do buraco. */
  deficitCents: number;
  /** Saída (a): gasto zero pelos próximos N dias restantes. */
  gastoZero: { diasSemGastar: number };
  /** Saída (b): puxar X da reserva (e reduzir a meta de poupança em X neste ciclo). */
  puxarDaReserva: { valorCents: number };
}

/**
 * Só entra em recuperação quando `saldoDisponivel <= 0`. O valor a puxar da
 * reserva é o próprio déficit (o mínimo para zerar o buraco); a decisão de
 * puxar fica registrada no ciclo pela camada de aplicação, não aqui.
 */
export function avaliarRecuperacao(e: EntradaRecuperacao): SaidaRecuperacao {
  assertCentavos(e.saldoDisponivelCents, 'saldoDisponivelCents');

  const emRecuperacao = e.saldoDisponivelCents <= 0;
  // Math.abs normaliza o caso saldo === 0 (evita -0 no resultado).
  const deficitCents = emRecuperacao ? Math.abs(e.saldoDisponivelCents) : 0;

  return {
    emRecuperacao,
    deficitCents,
    gastoZero: { diasSemGastar: emRecuperacao ? Math.max(e.diasRestantes, 0) : 0 },
    puxarDaReserva: { valorCents: deficitCents },
  };
}
