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
 * Origem (11/08/2026): o copiloto negou ao dono um fato do próprio motor por
 * receber `verbaVariavel` como número atômico, sem as partes que o formam.
 *
 * Desde a D-16 (14/09/2026) o fato é o OPOSTO — a meta de poupança não é
 * descontada da verba — e a lição é a mesma: sem as partes, o modelo chuta.
 * Aqui a saída diz explicitamente que a meta continua DENTRO da verba e o que
 * o dono precisa fazer para bater a meta.
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
      formula: 'verbaVariavel = renda − fixos − provisão + rollover',
      ...dinheiros({
        renda: params.rendaPrevistaCents,
        metaDePoupancaNaoDescontada: params.poupancaAlvoCents,
        fixosJaDescontados: params.fixosCents,
        provisaoJaDescontada: params.provisaoMensalCents,
        rollover: params.rolloverRecebidoCents,
      }),
      metaDePoupancaJaEstaNaVerba: false,
      observacao:
        'A meta de poupança NÃO foi subtraída de verbaVariavel (decisão D-16): ela é um ' +
        'OBJETIVO, não um gasto certo. O dinheiro da meta ainda está dentro da verba, e ' +
        'só vira poupança se o dono gastar menos que a verba — a poupança do ciclo é a ' +
        'sobra no fechamento. Portanto: para bater a meta, ele precisa gastar no máximo ' +
        'verbaVariavel − metaDePoupancaNaoDescontada. Nunca diga que a meta já está ' +
        'descontada da verba, e nunca some a meta de volta à verba: ela já está lá.',
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
