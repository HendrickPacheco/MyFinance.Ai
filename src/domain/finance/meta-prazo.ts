/**
 * Simulação de meta com prazo (caso real 11/08/2026): o dono pediu um plano
 * para juntar R$ 70.000,00 até janeiro, e o copiloto respondeu duas vezes que
 * não tinha ferramenta para isso — embora seja aritmética pura sobre dados que
 * o motor já possui (`verbaVariavelCents`, `poupancaAlvoCents`, ver `verba.ts`).
 *
 * Função PURA: sem I/O, sem `new Date()`. Recebe os ciclos JÁ PROJETADOS (por
 * `projetarCiclos`, via `application/projecao.ts`) e devolve quanto cabe
 * acumular até `dataLimite`.
 *
 * AJUSTE DO CICLO ATUAL — leia antes de mexer. A meta de poupança do ciclo em
 * curso não é dinheiro garantido: se o gasto já realizado estourou a verba
 * variável, o excedente sai da própria poupança daquele ciclo (é o mesmo
 * dinheiro, não um segundo buraco). Por isso o PRIMEIRO ciclo da lista pode
 * receber um aporte efetivo menor que `poupancaAlvoCents` — e o motivo viaja
 * explícito em `reduzidoPorGastoExcedente` (D-14): nunca reduza em silêncio.
 */
import { assertCentavos } from '@/shared/dinheiro';
import { assertData, type DataCivil } from '@/shared/data';
import { somaCents } from '@/shared/dinheiro';

/** O necessário de cada ciclo projetado para a simulação de meta. */
export interface CicloParaMeta {
  inicio: DataCivil;
  fim: DataCivil;
  poupancaAlvoCents: number;
}

/** Um ciclo já considerado na simulação, com o aporte efetivo explicado. */
export interface CicloDaSimulacaoMeta {
  inicio: DataCivil;
  fim: DataCivil;
  aportePrevistoCents: number;
  /**
   * `true` só no ciclo atual quando o gasto já realizado supera a verba
   * variável — o aporte deste ciclo específico é MENOR que `poupancaAlvoCents`
   * por causa disso, e a diferença é exatamente `excedenteCicloAtualCents`
   * recebido em `ParametrosSimulacaoMetaPrazo`.
   */
  reduzidoPorGastoExcedente: boolean;
  /**
   * A meta cheia do ciclo, ANTES do ajuste. Sempre presente (D-15): com ela e
   * `reducaoPorExcedenteCents`, `aportePrevistoCents` é recomponível, e quem
   * lê consegue dizer "seriam R$ X, viraram R$ Y porque você estourou R$ Z".
   */
  poupancaAlvoOriginalCents: number;
  /** Quanto o excedente comeu deste ciclo. `0` quando não houve ajuste. */
  reducaoPorExcedenteCents: number;
}

export interface ParametrosSimulacaoMetaPrazo {
  alvoCents: number;
  dataLimite: DataCivil;
  /**
   * Ciclos projetados a partir de hoje, em ordem cronológica, cobrindo pelo
   * menos até `dataLimite` — os que sobrarem depois são descartados aqui.
   */
  ciclos: readonly CicloParaMeta[];
  /**
   * `max(0, gastoRealizado − verbaVariavel)` do ciclo ATUAL (o primeiro da
   * lista). `null` quando não há ciclo aberto — nesse caso nenhum ciclo recebe
   * ajuste, porque não existe "ciclo atual" para estourar.
   */
  excedenteCicloAtualCents: number | null;
}

export interface ResultadoSimulacaoMetaPrazo {
  alvoCents: number;
  dataLimite: DataCivil;
  /** Um por ciclo dentro do prazo — a granularidade que sustenta o total. */
  ciclos: readonly CicloDaSimulacaoMeta[];
  numCiclos: number;
  /** Soma de `ciclos[].aportePrevistoCents` — nunca recomposto de outra forma. */
  totalAcumulavelCents: number;
  alcanca: boolean;
  /** Preenchido só quando `alcanca`. */
  folgaCents: number | null;
  /** Preenchido só quando NÃO `alcanca`. */
  faltaCents: number | null;
  /** `ceil(alvoCents / numCiclos)` — o aporte constante que bateria o alvo exatamente. */
  aportePorCicloNecessarioCents: number;
  /**
   * `poupancaAlvoCents` de um ciclo SEM o ajuste do excedente — a referência de
   * "quanto normalmente sobra por ciclo", usada para responder "e o resto vai
   * pra onde" (ex.: bitcoin).
   */
  aporteDisponivelPadraoCents: number;
  /** `aporteDisponivelPadraoCents − aportePorCicloNecessarioCents`. Pode ser negativo. */
  sobraPorCicloCents: number;
}

/**
 * Projeta quanto cabe acumular até `dataLimite` e se isso alcança `alvoCents`.
 *
 * @throws RangeError se nenhum ciclo da entrada começar até `dataLimite` — o
 *   prazo já passou em relação ao ciclo atual, e não há nada para simular.
 */
export function simularMetaPrazo(
  params: ParametrosSimulacaoMetaPrazo,
): ResultadoSimulacaoMetaPrazo {
  assertCentavos(params.alvoCents, 'alvoCents');
  if (params.alvoCents <= 0) {
    throw new RangeError(`alvoCents precisa ser positivo, recebido: ${params.alvoCents}`);
  }
  assertData(params.dataLimite, 'dataLimite');
  if (params.excedenteCicloAtualCents != null) {
    assertCentavos(params.excedenteCicloAtualCents, 'excedenteCicloAtualCents');
  }

  const dentroDoPrazo = params.ciclos.filter((ciclo) => ciclo.inicio <= params.dataLimite);
  if (dentroDoPrazo.length === 0) {
    throw new RangeError(
      `dataLimite "${params.dataLimite}" é anterior ao início do ciclo atual — não há ciclo para simular.`,
    );
  }

  const excedente = params.excedenteCicloAtualCents ?? 0;
  const ciclosDaMeta: CicloDaSimulacaoMeta[] = dentroDoPrazo.map((ciclo, indice) => {
    const ehCicloAtualAjustado = indice === 0 && excedente > 0;
    return {
      inicio: ciclo.inicio,
      fim: ciclo.fim,
      aportePrevistoCents: ehCicloAtualAjustado
        ? ciclo.poupancaAlvoCents - excedente
        : ciclo.poupancaAlvoCents,
      reduzidoPorGastoExcedente: ehCicloAtualAjustado,
      // D-15: as PARTES viajam junto do derivado. Antes só o booleano saía, e
      // o modelo conseguia dizer QUE o aporte foi reduzido sem dizer de quanto
      // nem a partir de quê — que é exatamente a pergunta seguinte do dono.
      // Mesma falha do `mesesDeReservaDesconhecido` (D-14), com o número
      // presente em vez de nulo.
      poupancaAlvoOriginalCents: ciclo.poupancaAlvoCents,
      reducaoPorExcedenteCents: ehCicloAtualAjustado ? excedente : 0,
    };
  });

  const numCiclos = ciclosDaMeta.length;
  const totalAcumulavelCents = somaCents(ciclosDaMeta.map((c) => c.aportePrevistoCents));

  const alcanca = totalAcumulavelCents >= params.alvoCents;

  // `poupancaAlvoCents` cru (sem ajuste) do ciclo mais representativo: o
  // SEGUNDO da lista quando existe — o atual pode estar ajustado pelo
  // excedente e não é "o normal". Com um único ciclo, ele é o único disponível.
  const cicloPadrao = dentroDoPrazo[1] ?? dentroDoPrazo[0];
  const aporteDisponivelPadraoCents = cicloPadrao ? cicloPadrao.poupancaAlvoCents : 0;

  const aportePorCicloNecessarioCents = Math.ceil(params.alvoCents / numCiclos);

  return {
    alvoCents: params.alvoCents,
    dataLimite: params.dataLimite,
    ciclos: ciclosDaMeta,
    numCiclos,
    totalAcumulavelCents,
    alcanca,
    folgaCents: alcanca ? totalAcumulavelCents - params.alvoCents : null,
    faltaCents: alcanca ? null : params.alvoCents - totalAcumulavelCents,
    aportePorCicloNecessarioCents,
    aporteDisponivelPadraoCents,
    sobraPorCicloCents: aporteDisponivelPadraoCents - aportePorCicloNecessarioCents,
  };
}
