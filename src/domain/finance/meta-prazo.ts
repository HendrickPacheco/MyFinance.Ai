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
 * APORTE NÃO É A META (D-16). A meta de poupança não é descontada da verba:
 * o que dá para guardar num ciclo é o que SOBRA da verba livre depois do
 * gasto, com teto na própria meta (poupar além dela não é o plano). Então:
 *
 *   aporte = max(0, min(meta, verbaLivre − gastoJáRealizado))
 *
 * O gasto realizado só existe no ciclo ATUAL (o primeiro da lista); nos
 * futuros ele é zero e o aporte é `min(meta, verbaLivre)`. Quando o aporte sai
 * menor que a meta, o motivo viaja explícito em `reduzidoPorGastoExcedente` +
 * `reducaoPorExcedenteCents` (D-14/D-15): nunca reduza em silêncio.
 */
import { assertCentavos } from '@/shared/dinheiro';
import { assertData, type DataCivil } from '@/shared/data';
import { somaCents } from '@/shared/dinheiro';

/** O necessário de cada ciclo projetado para a simulação de meta. */
export interface CicloParaMeta {
  inicio: DataCivil;
  fim: DataCivil;
  poupancaAlvoCents: number;
  /** Verba do ciclo já sem as parcelas comprometidas — o teto real do aporte. */
  verbaLivreCents: number;
}

/** Um ciclo já considerado na simulação, com o aporte efetivo explicado. */
export interface CicloDaSimulacaoMeta {
  inicio: DataCivil;
  fim: DataCivil;
  aportePrevistoCents: number;
  /**
   * `true` quando o aporte saiu MENOR que `poupancaAlvoCents` — ou porque o
   * gasto já realizado comeu a verba deste ciclo, ou porque a verba livre do
   * ciclo não chega à meta. A diferença é `reducaoPorExcedenteCents`.
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
   * Gasto já realizado no ciclo ATUAL (o primeiro da lista). `null` quando não
   * há ciclo aberto — nesse caso nem o primeiro ciclo tem gasto a descontar.
   */
  gastoRealizadoCicloAtualCents: number | null;
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
   * Aporte de um ciclo SEM gasto já realizado — a referência de
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
  if (params.gastoRealizadoCicloAtualCents != null) {
    assertCentavos(params.gastoRealizadoCicloAtualCents, 'gastoRealizadoCicloAtualCents');
  }

  const dentroDoPrazo = params.ciclos.filter((ciclo) => ciclo.inicio <= params.dataLimite);
  if (dentroDoPrazo.length === 0) {
    throw new RangeError(
      `dataLimite "${params.dataLimite}" é anterior ao início do ciclo atual — não há ciclo para simular.`,
    );
  }

  const gastoDoCicloAtual = params.gastoRealizadoCicloAtualCents ?? 0;
  const ciclosDaMeta: CicloDaSimulacaoMeta[] = dentroDoPrazo.map((ciclo, indice) => {
    const gasto = indice === 0 ? gastoDoCicloAtual : 0;
    const sobraPossivel = Math.max(0, ciclo.verbaLivreCents - gasto);
    const aportePrevistoCents = Math.min(ciclo.poupancaAlvoCents, sobraPossivel);
    const reducao = ciclo.poupancaAlvoCents - aportePrevistoCents;
    return {
      inicio: ciclo.inicio,
      fim: ciclo.fim,
      aportePrevistoCents,
      reduzidoPorGastoExcedente: reducao > 0,
      // D-15: as PARTES viajam junto do derivado. Antes só o booleano saía, e
      // o modelo conseguia dizer QUE o aporte foi reduzido sem dizer de quanto
      // nem a partir de quê — que é exatamente a pergunta seguinte do dono.
      // Mesma falha do `mesesDeReservaDesconhecido` (D-14), com o número
      // presente em vez de nulo.
      poupancaAlvoOriginalCents: ciclo.poupancaAlvoCents,
      reducaoPorExcedenteCents: reducao,
    };
  });

  const numCiclos = ciclosDaMeta.length;
  const totalAcumulavelCents = somaCents(ciclosDaMeta.map((c) => c.aportePrevistoCents));

  const alcanca = totalAcumulavelCents >= params.alvoCents;

  // O aporte de um ciclo LIMPO (sem gasto já realizado): o SEGUNDO da lista
  // quando existe — o atual carrega o gasto do mês em curso e não é "o normal".
  // Com um único ciclo, ele é o único disponível.
  const cicloPadrao = dentroDoPrazo[1] ?? dentroDoPrazo[0];
  const aporteDisponivelPadraoCents = cicloPadrao
    ? Math.min(cicloPadrao.poupancaAlvoCents, Math.max(0, cicloPadrao.verbaLivreCents))
    : 0;

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
