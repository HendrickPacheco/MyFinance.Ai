/**
 * Contas do RESUMO da projeção (Fase 10, TASKS-CUSTOS §3.4). Funções PURAS:
 * recebem séries de números já projetados por `projetarCiclos` e devolvem os
 * agregados que a manchete e o cabeçalho da tela `/projecao` mostram —
 * extremos, degraus e contagens.
 *
 * Por que isto mora no domínio e não no read-model: são contas (CLAUDE.md
 * regra 4). O read-model só monta a frase em volta dos números que saem daqui.
 *
 * NENHUMA função deste arquivo subtrai parcela de coisa alguma (decisão D-11):
 * elas operam sobre `verbaLivreCents`, que JÁ é
 * `verbaVariavel − parcelasComprometidas`. Subtrair de novo contaria a parcela
 * duas vezes.
 */
import { assertCentavos, somaCents } from '@/shared/dinheiro';

/** Uma variação de verba livre entre dois ciclos consecutivos. */
export interface DegrauVerbaLivre {
  /** Índice do ciclo DE CHEGADA — o ciclo em que a mudança se realiza. */
  indice: number;
  /** `serie[indice] − serie[indice - 1]`. Positivo = mais dinheiro livre. */
  deltaCents: number;
}

export interface ExtremoVerbaLivre {
  indice: number;
  verbaLivreCents: number;
}

export interface ExtremosVerbaLivre {
  minima: ExtremoVerbaLivre;
  maxima: ExtremoVerbaLivre;
}

export interface ExtremosDeDegrau {
  /** Maior alta estrita. `null` quando a verba nunca sobe. */
  maiorAlta: DegrauVerbaLivre | null;
  /** Maior queda estrita. `null` quando a verba nunca cai. */
  maiorQueda: DegrauVerbaLivre | null;
}

/**
 * Variação de verba livre ciclo a ciclo, alinhada 1:1 com a série de entrada.
 *
 * O primeiro elemento é `null`, não `0`: não existe ciclo anterior com que
 * comparar, e emitir zero ali seria afirmar "não mudou nada" sobre uma
 * comparação que nunca aconteceu.
 */
export function deltasVerbaLivreCents(serie: readonly number[]): (number | null)[] {
  return serie.map((valor, i) => {
    assertCentavos(valor, 'verbaLivreCents');
    if (i === 0) return null;
    const anterior = serie[i - 1];
    if (anterior === undefined) return null;
    return valor - anterior;
  });
}

/**
 * Maior alta e maior queda de verba livre entre ciclos consecutivos.
 *
 * Empate resolve pelo ciclo MAIS CEDO: entre dois degraus de mesmo tamanho, o
 * que importa para quem decide é o primeiro — é a partir dele que o dinheiro
 * está disponível.
 *
 * Ambos são estritos (`> 0` / `< 0`): uma série plana devolve `null` nos dois,
 * e quem monta a manchete precisa dessa distinção para não anunciar um
 * "degrau" de zero centavo.
 */
export function extremosDeDegrau(serie: readonly number[]): ExtremosDeDegrau {
  let maiorAlta: DegrauVerbaLivre | null = null;
  let maiorQueda: DegrauVerbaLivre | null = null;

  for (const [indice, deltaCents] of deltasVerbaLivreCents(serie).entries()) {
    if (deltaCents === null) continue;
    if (deltaCents > 0 && (maiorAlta === null || deltaCents > maiorAlta.deltaCents)) {
      maiorAlta = { indice, deltaCents };
    }
    if (deltaCents < 0 && (maiorQueda === null || deltaCents < maiorQueda.deltaCents)) {
      maiorQueda = { indice, deltaCents };
    }
  }

  return { maiorAlta, maiorQueda };
}

/**
 * Mínima e máxima de verba livre no horizonte. Empate resolve pelo ciclo mais
 * cedo, pelo mesmo motivo dos degraus.
 *
 * Lança em série vazia em vez de devolver um extremo inventado: "a menor verba
 * livre de nada" não tem resposta honesta, e um `0` ali viraria um KPI falso na
 * tela.
 */
export function extremosVerbaLivre(serie: readonly number[]): ExtremosVerbaLivre {
  const primeiro = serie[0];
  if (primeiro === undefined) {
    throw new RangeError('extremosVerbaLivre exige pelo menos um ciclo');
  }

  let minima: ExtremoVerbaLivre = { indice: 0, verbaLivreCents: assertCentavos(primeiro) };
  let maxima: ExtremoVerbaLivre = { indice: 0, verbaLivreCents: primeiro };

  for (const [indice, valor] of serie.entries()) {
    assertCentavos(valor, 'verbaLivreCents');
    if (valor < minima.verbaLivreCents) minima = { indice, verbaLivreCents: valor };
    if (valor > maxima.verbaLivreCents) maxima = { indice, verbaLivreCents: valor };
  }

  return { minima, maxima };
}

/** Quantos ciclos do horizonte ficam abaixo do piso diário de verba. */
export function contarAbaixoDoPiso(flags: readonly boolean[]): number {
  return flags.reduce((total, abaixo) => (abaixo ? total + 1 : total), 0);
}

/**
 * Soma das cinco faixas da coluna empilhada de §3.4 — fixos, provisão,
 * poupança-alvo, parcelas e verba livre.
 *
 * Existe porque essa soma NÃO é `rendaPrevistaCents` em todo ciclo, e uma
 * pilha desenhada contra a renda mentiria a altura das faixas. A identidade
 * real é `renda + rollover`, e o ciclo congelado pode fugir até dela: depois de
 * `puxarDaReserva` a verba gravada deixa de ser a soma das partes (SPEC 5.2), e
 * é a verba GRAVADA que vale. Este total é a única altura de barra que fecha
 * com as faixas em todos os casos.
 */
export function totalComposicaoCents(partes: {
  fixosCents: number;
  provisaoMensalCents: number;
  poupancaAlvoCents: number;
  parcelasComprometidasCents: number;
  verbaLivreCents: number;
}): number {
  return somaCents([
    partes.fixosCents,
    partes.provisaoMensalCents,
    partes.poupancaAlvoCents,
    partes.parcelasComprometidasCents,
    partes.verbaLivreCents,
  ]);
}
