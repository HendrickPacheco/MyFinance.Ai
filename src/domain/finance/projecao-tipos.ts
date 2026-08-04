/**
 * Tipos da projeção de ciclos futuros (Fase C). Entrada e saída são formas
 * mínimas e puras: a projeção não toca banco, não lê relógio e não conhece
 * Prisma — quem monta a entrada é o read-model em `src/application/projecao.ts`.
 *
 * ATENÇÃO AO MODELO DE VERBA — leia antes de "corrigir" qualquer coisa aqui.
 * Parcela CONSOME a verba variável: cada parcela é uma `Transacao` de tipo
 * DESPESA e grupo VARIAVEL, e come o teto diário como qualquer outro gasto.
 * Ela NÃO é deduzida no cálculo da verba (ver `verbaVariavelCents` em
 * `verba.ts`). Por isso os três campos abaixo coexistem, cada um com o rótulo
 * do bolso de onde vem:
 *
 *   verbaVariavelCents        renda − poupança − fixos − provisão (+ rollover)
 *   parcelasComprometidasCents  soma das parcelas que caem no ciclo
 *   verbaLivreCents           verbaVariavel − parcelasComprometidas
 *
 * `verbaLivreCents` é O número que responde "quanto sobra de verdade".
 * Subtrair parcela dentro de `verbaVariavelCents` a contaria duas vezes e
 * produziria um número plausível e falso.
 */
import type { DataCivil } from '@/shared/data';
import type { DestinoSobra } from '@/domain/model/enums';

/**
 * Uma obrigação já assumida que cai numa data futura — na prática, uma parcela
 * já gravada como `Transacao`. A projeção LÊ estas obrigações; nunca regenera
 * parcelas do passado a partir de `Parcelamento`.
 */
export interface ObrigacaoFutura {
  data: DataCivil;
  valorCents: number;
  parcelamentoId: string | null;
}

/** Uma compra parcelada futura a simular (pré-mortem de compra). */
export interface CenarioHipotetico {
  descricao: string;
  valorTotalCents: number;
  numParcelas: number;
  dataCompra: DataCivil;
}

/**
 * O ciclo atual, como está CONGELADO no banco (SPEC 5.2). Quando presente, é
 * emitido tal e qual pela projeção: limites e verba vêm daqui, não são
 * recalculados a partir da Config vigente.
 *
 * Isso existe porque recalcular o ciclo em curso está errado de duas formas.
 * (1) Os limites: editar `diaRecebimento` mudaria as datas do mês corrente,
 * que já nasceu. (2) A verba: `puxarDaReserva` (modo recuperação) soma X à
 * verba e reduz a poupança-alvo com clamp em zero — depois disso a verba
 * gravada deixa de ser a soma das suas partes, e reconstruí-la pelas partes
 * devolve um número diferente do que o usuário vê na tela Hoje.
 */
export interface CicloCongelado {
  inicio: DataCivil;
  fim: DataCivil;
  rendaPrevistaCents: number;
  poupancaAlvoCents: number;
  fixosCents: number;
  provisaoMensalCents: number;
  /** A verba gravada. Fonte de verdade — não é recomposta pelas partes. */
  verbaVariavelCents: number;
  rolloverRecebidoCents: number;
}

export interface EntradaProjecao {
  /**
   * Data civil a partir da qual projetar quando NÃO há ciclo congelado.
   * Com `cicloCongelado` preenchido, ele é o ciclo 1 e este campo é ignorado.
   */
  dataBase: DataCivil;

  /** Ciclo 1 já gravado. Ausente = nenhum ciclo aberto ainda. */
  cicloCongelado?: CicloCongelado;
  diaRecebimento: number;
  /** Horizonte em ciclos. Válido em [1, 60]. */
  numCiclos: number;

  rendaPrevistaCents: number;
  metaPoupancaCents: number;
  /** Se preenchida, tem precedência e incide sobre a renda do mês (0–100). */
  metaPoupancaPercent: number | null;
  fixosCents: number;
  valoresProvisaoAnualCents: readonly number[];

  destinoSobra: DestinoSobra;
  /** Rollover que entra no ciclo 1. Nos ciclos ≥ 2 a projeção assume sobra
   * zero — não há como adivinhar gasto futuro. */
  rolloverInicialCents: number;

  /** Piso diário de verba, para avaliar `abaixoDoPiso`. */
  pisoDiarioVerbaCents: number;

  obrigacoesFuturas: readonly ObrigacaoFutura[];

  /** Compra hipotética a sobrepor à projeção base. */
  cenario?: CenarioHipotetico;
}

export interface CicloProjetado {
  inicio: DataCivil;
  fim: DataCivil;
  diasTotais: number;

  rendaPrevistaCents: number;
  poupancaAlvoCents: number;
  fixosCents: number;
  provisaoMensalCents: number;

  /** Verba do motor: renda − poupança − fixos − provisão (+ rollover).
   * NÃO desconta parcela — ver o cabeçalho deste arquivo. */
  verbaVariavelCents: number;
  /** Soma das obrigações futuras que caem no intervalo do ciclo. */
  parcelasComprometidasCents: number;
  /** `verbaVariavelCents − parcelasComprometidasCents`. O que sobra de verdade. */
  verbaLivreCents: number;
  /** `verbaLivreCents` dividido pelos dias do ciclo (floor). */
  verbaDiariaLivreCents: number;

  rolloverRecebidoCents: number;
  /** `verbaDiariaLivreCents` abaixo do piso — avaliado sobre a verba LIVRE,
   * porque avaliar sobre a bruta esconderia exatamente o aperto da parcela. */
  abaixoDoPiso: boolean;
}

/** Saída de `projetarComCenario`: base, cenário sobreposto e a diferença. */
export interface ProjecaoComCenario {
  base: readonly CicloProjetado[];
  comCenario: readonly CicloProjetado[];
  /** Por ciclo, o impacto do cenário. Negativo = menos dinheiro livre. */
  delta: readonly DeltaCiclo[];
}

export interface DeltaCiclo {
  inicio: DataCivil;
  parcelasComprometidasCents: number;
  verbaLivreCents: number;
  verbaDiariaLivreCents: number;
  /** O cenário derruba este ciclo abaixo do piso sem que a base estivesse. */
  passouAFicarAbaixoDoPiso: boolean;
}
