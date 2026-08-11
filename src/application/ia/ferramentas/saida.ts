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
 * Decomposição da verba variável, para toda ferramenta que a expõe.
 *
 * Origem (11/08/2026): o dono afirmou que a meta de poupança já sai da verba —
 * está certo, é literalmente `verbaVariavelCents` em domain/finance/verba.ts —
 * e o copiloto RESPONDEU QUE NÃO. Ele não tinha como saber: recebia
 * `verbaVariavel` como número atômico, e o rótulo "antes de descontar parcela"
 * ainda sugeria que nada havia sido descontado.
 *
 * Um número derivado que chega sem suas partes convida o modelo a inventar de
 * onde ele veio — inventando uma causa (caso do patrimônio) ou negando um fato
 * (este caso). Por isso a decomposição viaja SEMPRE junto da verba, com a
 * fórmula em texto.
 */
export function composicaoDaVerba(params: {
  rendaPrevistaCents: number;
  poupancaAlvoCents: number;
  fixosCents: number;
  provisaoMensalCents: number;
  rolloverRecebidoCents: number;
}): SaidaFerramenta {
  return {
    composicaoDaVerba: {
      formula: 'verbaVariavel = renda − poupança − fixos − provisão + rollover',
      ...dinheiros({
        renda: params.rendaPrevistaCents,
        poupancaJaDescontada: params.poupancaAlvoCents,
        fixosJaDescontados: params.fixosCents,
        provisaoJaDescontada: params.provisaoMensalCents,
        rollover: params.rolloverRecebidoCents,
      }),
      metaDePoupancaJaEstaNaVerba: true,
      observacao:
        'A meta de poupança JÁ foi subtraída para chegar em verbaVariavel. Ela não ' +
        'aparece como linha separada porque não é um gasto do ciclo — é dinheiro que ' +
        'nunca entrou na verba. Nunca diga que a meta não está descontada, e nunca ' +
        'sugira separá-la de novo a partir da verba livre: isso a contaria duas vezes.',
    },
  };
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
