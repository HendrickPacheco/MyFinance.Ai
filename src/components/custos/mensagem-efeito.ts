import type { EfeitoNoCicloAtual } from '@/application/ciclos';
import { formatBRL } from '@/shared/dinheiro';
import { formatarDataCurta } from '@/shared/data';

/**
 * A confirmação de salvamento/desativação/exclusão, com as duas datas e os
 * dois valores CONCRETOS — nunca adjetivada (TASKS-CUSTOS §4.3 item 0 e 2).
 *
 * A bifurcação não é estética. `recalcularCicloAtualSeVazio` recalcula o ciclo
 * corrente quando ele ainda não tem transação nenhuma — o que é exatamente o
 * caso no dia 1 do ciclo, quando o dono está arrumando os custos. Dizer "vale
 * a partir do próximo ciclo" ali seria mentira: a verba de hoje mudou na hora.
 * Por isso o servidor devolve o que aconteceu e quem escolhe a frase é aqui.
 */
export function mensagemDoEfeito(prefixo: string, efeito: EfeitoNoCicloAtual): string {
  if (efeito.recalculou) {
    const periodo = `${formatarDataCurta(efeito.ciclo.inicio)} – ${formatarDataCurta(efeito.ciclo.fim)}`;
    return `${prefixo} O ciclo atual ainda não tem gasto lançado, então a verba de ${periodo} passou de ${formatBRL(efeito.verbaAntesCents)} para ${formatBRL(efeito.ciclo.verbaCents)}.`;
  }
  if (!efeito.ciclo) {
    return `${prefixo} Ainda não há ciclo aberto — vale no primeiro que nascer.`;
  }
  return `${prefixo} Vale a partir de ${formatarDataCurta(efeito.ciclo.proximoInicio)} — o ciclo atual continua em ${formatBRL(efeito.ciclo.verbaCents)}.`;
}
