/**
 * Formato de saída das ferramentas (convenção declarada na D1).
 *
 * A regra que estes helpers existem para impor: o modelo NUNCA recompõe um
 * valor a partir dos centavos. Toda grandeza monetária sai como um par de
 * campos irmãos — `<nome>Cents` e `<nome>Formatado` — e o prompt manda citar
 * a string. `formatBRL` é a única fonte de formatação (CLAUDE.md regra 1).
 */
import { formatBRL } from '@/shared/dinheiro';

export type SaidaFerramenta = Record<string, unknown>;

/**
 * Par monetário irmão:
 *   dinheiro('tetoHoje', 8300) -> { tetoHojeCents: 8300, tetoHojeFormatado: "R$ 83,00" }
 */
export function dinheiro(nome: string, cents: number): SaidaFerramenta {
  return { [`${nome}Cents`]: cents, [`${nome}Formatado`]: formatBRL(cents) };
}

/** Vários pares de uma vez, a partir de um objeto nome -> centavos. */
export function dinheiros(valores: Record<string, number>): SaidaFerramenta {
  return Object.assign({}, ...Object.entries(valores).map(([n, c]) => dinheiro(n, c)));
}

/**
 * Resposta honesta quando não há ciclo aberto. A ferramenta NÃO cria um — quem
 * abre ciclo é a tela que o usuário acessa, nunca uma pergunta (decisão D-8).
 */
export function semCicloAberto(comoFoiCalculado: string): SaidaFerramenta {
  return {
    semCicloAberto: true,
    mensagem:
      'Não há ciclo aberto no momento. Abra o app para que o ciclo do período atual seja criado.',
    comoFoiCalculado,
  };
}

/** Erro legível para o modelo — nunca uma exceção que mata o loop do agente. */
export function erroFerramenta(mensagem: string): SaidaFerramenta {
  return { erro: mensagem };
}
