/**
 * Verba variável — o único dinheiro realmente livre no ciclo (SPEC 3 e 5.3).
 * Tudo que não é verba variável está comprometido e não pode aparecer como
 * disponível em nenhuma tela.
 */
import { assertCentavos, somaCents, ratearCents } from '@/shared/dinheiro';
import type { ParametrosVerba } from './tipos';

/**
 * Provisão mensal = soma das provisões anuais ativas / 12.
 * Divisão usa `floor` (decisão: igual ao resto do sistema — SPEC regra 11).
 */
export function provisaoMensalCents(valoresAnuaisCents: readonly number[]): number {
  const somaAnual = somaCents(valoresAnuaisCents);
  return Math.floor(somaAnual / 12);
}

/**
 * Rateia a provisão mensal do CICLO (floor da soma anual — o valor já
 * reservado na verba, ver `provisaoMensalCents`) entre as provisões
 * individuais, na mesma ordem recebida.
 *
 * A soma das partes creditadas TEM que bater exatamente com o valor
 * reservado na verba (SPEC regra 11). Somar `floor(valorAnual/12)` provisão a
 * provisão não garante isso: `floor` aplicado por partes perde até
 * `partes - 1` centavos frente ao `floor` aplicado no total. Por isso cada
 * provisão recebe sua base individual (`floor(valorAnual/12)`) e o resíduo
 * entre essa soma e o total do ciclo é distribuído com `ratearCents` — a
 * mesma função de rateio usada no resto do sistema, não uma nova.
 */
export function distribuirProvisaoMensalCents(valoresAnuaisCents: readonly number[]): number[] {
  if (valoresAnuaisCents.length === 0) return [];

  const basesIndividuais = valoresAnuaisCents.map((v) =>
    Math.floor(assertCentavos(v, 'valorAnualCents') / 12),
  );
  const totalMensalCiclo = provisaoMensalCents(valoresAnuaisCents);
  const residuoNaoDistribuido = totalMensalCiclo - somaCents(basesIndividuais);
  const complementos = ratearCents(residuoNaoDistribuido, valoresAnuaisCents.length);

  return basesIndividuais.map((base, i) => base + (complementos[i] ?? 0));
}

/**
 * Poupança-alvo do ciclo. Se `metaPoupancaPercent` está preenchida, ela tem
 * precedência e incide sobre a renda daquele mês (decisão item 2). Percentual
 * expresso em 0–100 (ex.: 20 = 20%).
 */
export function poupancaAlvoCents(params: {
  rendaPrevistaCents: number;
  metaPoupancaCents: number;
  metaPoupancaPercent?: number | null;
}): number {
  assertCentavos(params.rendaPrevistaCents, 'rendaPrevistaCents');
  assertCentavos(params.metaPoupancaCents, 'metaPoupancaCents');

  if (params.metaPoupancaPercent != null) {
    if (params.metaPoupancaPercent < 0) {
      throw new RangeError('metaPoupancaPercent não pode ser negativa');
    }
    return Math.floor((params.rendaPrevistaCents * params.metaPoupancaPercent) / 100);
  }
  return params.metaPoupancaCents;
}

/**
 * Verba variável do ciclo:
 *   renda − poupança − fixos − provisão (+ rollover herdado).
 * Pode ser negativa (renda insuficiente / rollover negativo) — quem trata
 * isso é o modo recuperação, não este cálculo.
 */
export function verbaVariavelCents(params: ParametrosVerba): number {
  assertCentavos(params.rendaPrevistaCents, 'rendaPrevistaCents');
  assertCentavos(params.poupancaAlvoCents, 'poupancaAlvoCents');
  assertCentavos(params.fixosCents, 'fixosCents');
  assertCentavos(params.provisaoMensalCents, 'provisaoMensalCents');
  const rollover = params.rolloverRecebidoCents ?? 0;
  assertCentavos(rollover, 'rolloverRecebidoCents');

  return (
    params.rendaPrevistaCents -
    params.poupancaAlvoCents -
    params.fixosCents -
    params.provisaoMensalCents +
    rollover
  );
}
