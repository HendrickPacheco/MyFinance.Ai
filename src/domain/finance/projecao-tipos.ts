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
import type { CustoComVigencia } from './verba';

/**
 * Uma obrigação já assumida que cai numa data futura — na prática, uma parcela
 * já gravada como `Transacao`. A projeção LÊ estas obrigações; nunca regenera
 * parcelas do passado a partir de `Parcelamento`.
 *
 * `descricao`/`parcelaNum`/`numParcelas` são OPCIONAIS de propósito: quem monta
 * a entrada pode não ter o cadastro do parcelamento em mãos (as ferramentas de
 * IA montam a entrada só com data/valor). Quem preenche é o read-model.
 */
export interface ObrigacaoFutura {
  data: DataCivil;
  valorCents: number;
  parcelamentoId: string | null;
  descricao?: string | null;
  /** 1-based. */
  parcelaNum?: number | null;
  numParcelas?: number | null;
}

/**
 * Uma parcela que cai dentro do ciclo, já detalhada. Só descreve — nenhum
 * campo daqui entra em `verbaVariavelCents` (decisão D-11, ver cabeçalho).
 *
 * `descricao` e `parcelaNum` são NULÁVEIS, ao contrário do que o plano previa:
 * eles vêm de campos opcionais de `ObrigacaoFutura`, e nem todo chamador os
 * tem. Tipar como não-nulo seria mentir — a UI teria `undefined` num campo que
 * o tipo jura existir.
 */
export interface ObrigacaoDoCiclo {
  parcelamentoId: string | null;
  descricao: string | null;
  valorCents: number;
  parcelaNum: number | null;
  numParcelas: number | null;
}

/**
 * Um parcelamento cuja ÚLTIMA parcela cai neste ciclo — a partir do próximo,
 * este dinheiro volta para a verba livre. É a informação que faz a projeção
 * responder "quando é que eu respiro de novo?".
 */
export interface FimDeParcelamento {
  parcelamentoId: string;
  descricao: string | null;
  /** O valor da última parcela: é ele que deixa de comprometer verba. */
  valorMensalCents: number;
}

/** Uma compra parcelada futura a simular (pré-mortem de compra). */
export interface CenarioCompraParcelada {
  tipo: 'compraParcelada';
  descricao: string;
  valorTotalCents: number;
  numParcelas: number;
  dataCompra: DataCivil;
}

/**
 * Renda hipotética a substituir a renda vigente nos ciclos que ainda não
 * nasceram (caso real 11/08/2026: "se minha renda cair para 15k, dou conta
 * das parcelas?"). NUNCA reescreve o ciclo congelado — ver `CicloCongelado` e
 * o cabeçalho de `projecao.ts` sobre por que o ciclo em curso é imutável.
 */
export interface CenarioRendaHipotetica {
  tipo: 'rendaHipotetica';
  rendaHipoteticaCents: number;
}

/**
 * Uma hipótese a sobrepor à linha de base. Discriminada por `tipo` — cada
 * variante afeta uma parte diferente da projeção (obrigação nova vs.
 * parâmetro trocado), e `projetarCiclos` decide o que fazer só olhando este
 * campo. Adicionar uma terceira hipótese é adicionar um membro aqui, nunca
 * uma segunda função que duplica `projetarCiclos`.
 */
export type CenarioHipotetico = CenarioCompraParcelada | CenarioRendaHipotetica;

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
  /** Fallback escalar: usado em todo ciclo futuro quando `custosComVigencia`
   * está ausente. Continua obrigatório — é o que mantém os chamadores antigos
   * (inclusive as ferramentas de IA) funcionando sem mudança. */
  fixosCents: number;
  /**
   * Custos fixos com vigência. Quando presente, o `fixosCents` de CADA ciclo
   * futuro é recalculado por sobreposição de intervalo
   * (`fixosVigentesNoCicloCents`) e o escalar acima é ignorado nesses ciclos.
   * O `cicloCongelado` nunca é recomputado (SPEC 5.2): vigência só afeta
   * ciclos ≥ 2.
   */
  custosComVigencia?: readonly CustoComVigencia[];
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
  /** Soma das obrigações futuras que caem no intervalo do ciclo.
   * Vale sempre `soma(obrigacoesDoCiclo.valorCents)` — os dois saem do MESMO
   * filtro, exatamente para não poderem divergir. */
  parcelasComprometidasCents: number;
  /** As parcelas que caem no ciclo, uma a uma. Detalhe puro: não entra em
   * nenhum cálculo de verba. */
  obrigacoesDoCiclo: readonly ObrigacaoDoCiclo[];
  /** Parcelamentos cuja última parcela é neste ciclo (`parcelaNum ===
   * numParcelas`). Vazio quando a entrada não trouxe esses campos. */
  terminamNesteCiclo: readonly FimDeParcelamento[];
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
