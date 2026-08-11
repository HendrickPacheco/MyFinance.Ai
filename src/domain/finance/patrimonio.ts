/**
 * Patrimônio (SPEC 5.6). Visão independente do fluxo de caixa. `mesesDeReserva`
 * é o número de destaque: traduz patrimônio em segurança.
 */
import { somaCents } from '@/shared/dinheiro';
import type { ClassePatrimonio } from '@/domain/model/enums';

/** Total de um snapshot = soma dos itens. */
export function totalPatrimonioCents(itensValoresCents: readonly number[]): number {
  return somaCents(itensValoresCents);
}

/** Variação entre o mês atual e o anterior (pode ser negativa). */
export function variacaoMensalCents(totalAtualCents: number, totalAnteriorCents: number): number {
  return totalAtualCents - totalAnteriorCents;
}

/**
 * Taxa de acumulação média: média das variações dos últimos `janela` snapshots.
 * Recebe os totais em ordem cronológica; calcula as diferenças consecutivas.
 * Indicador de leitura (pode ser fracionário).
 */
export function taxaAcumulacaoMediaCents(
  totaisCronologicos: readonly number[],
  janela = 6,
): number {
  if (totaisCronologicos.length < 2) return 0;

  const variacoes: number[] = [];
  for (let i = 1; i < totaisCronologicos.length; i++) {
    variacoes.push((totaisCronologicos[i] as number) - (totaisCronologicos[i - 1] as number));
  }

  const ultimas = variacoes.slice(-janela);
  const soma = ultimas.reduce((a, b) => a + b, 0);
  return soma / ultimas.length;
}

/**
 * Meses de reserva = saldo das contas de reserva / custo mensal médio.
 * Indicador de leitura (fracionário).
 *
 * `custoMensalMedioCents` é `null` quando ainda não há histórico de ciclos
 * fechados suficiente para conhecer o custo mensal médio (ver
 * `custoMensalMedio` em `src/application/patrimonio.ts`) — nesse caso o
 * indicador é **não calculável** e a função devolve `null` (nunca 0
 * fabricado a partir de um divisor ausente; SPEC 13).
 *
 * Custo <= 0 (ausente, zerado sem histórico real ou negativo/inconsistente)
 * também devolve `null`: sem um divisor positivo e confiável não há conta
 * possível. Reserva zerada com custo real conhecido devolve 0 — esse é o
 * "zero de verdade" (a reserva de fato não sustenta nenhum mês).
 */
export function mesesDeReserva(params: {
  saldoReservaCents: number;
  custoMensalMedioCents: number | null;
}): number | null {
  const { saldoReservaCents, custoMensalMedioCents } = params;
  if (custoMensalMedioCents === null || custoMensalMedioCents <= 0) return null;
  return saldoReservaCents / custoMensalMedioCents;
}

/**
 * Uma linha de conciliação: o razão do app contra a realidade observada.
 * `deltaCents` positivo = você tem mais do que o app achava (rendimento,
 * depósito não lançado); negativo = tem menos (gasto não lançado).
 */
export interface DivergenciaConciliacao {
  itemId: string;
  contaId: string;
  nomeItem: string;
  /** `Conta.saldoCents`: o que o app calculou a partir de transações e fechamentos. */
  razaoCents: number;
  /** `ItemPatrimonio.valorCents`: o que você observou no banco e digitou. */
  observadoCents: number;
  /** `observado - razao`. Nunca zero — item que bate não vira divergência. */
  deltaCents: number;
}

export interface ItemConciliavel {
  id: string;
  nome: string;
  contaId: string | null;
  valorCents: number;
}

/**
 * Compara os itens de um snapshot com o saldo das contas que eles fotografam.
 *
 * Só entra na lista item COM `contaId` cujo valor DIFERE do razão: divergência
 * de zero não é informação, e item sem conta ligada (imóvel, cripto) não tem
 * razão contra o que comparar. A diferença é deixada como sinal para o dono
 * decidir — nada aqui escreve, e sincronizar em silêncio destruiria justamente
 * o dado que torna a conciliação útil.
 */
export function divergenciasConciliacao(
  itens: readonly ItemConciliavel[],
  saldosPorConta: ReadonlyMap<string, number>,
): DivergenciaConciliacao[] {
  const divergencias: DivergenciaConciliacao[] = [];

  for (const item of itens) {
    if (item.contaId === null) continue;

    const razaoCents = saldosPorConta.get(item.contaId);
    // Conta ausente do mapa (arquivada, apagada) não é divergência de zero —
    // é ausência de razão para comparar.
    if (razaoCents === undefined) continue;

    const deltaCents = item.valorCents - razaoCents;
    if (deltaCents === 0) continue;

    divergencias.push({
      itemId: item.id,
      contaId: item.contaId,
      nomeItem: item.nome,
      razaoCents,
      observadoCents: item.valorCents,
      deltaCents,
    });
  }

  return divergencias;
}

export interface ItemPatrimonioClasse {
  classe: ClassePatrimonio;
  valorCents: number;
}

export interface TotalPorClasse {
  classe: ClassePatrimonio;
  totalCents: number;
}

/**
 * Soma os itens de um snapshot por classe patrimonial, preservando a ordem
 * de primeira aparição. Lista vazia devolve `[]`.
 */
export function totalPorClasseCents(itens: readonly ItemPatrimonioClasse[]): TotalPorClasse[] {
  const totaisPorClasse = new Map<ClassePatrimonio, number>();

  for (const item of itens) {
    totaisPorClasse.set(item.classe, (totaisPorClasse.get(item.classe) ?? 0) + item.valorCents);
  }

  return [...totaisPorClasse.entries()].map(([classe, totalCents]) => ({ classe, totalCents }));
}
