/**
 * Contrato do read-model do painel desktop (`/`).
 *
 * Este arquivo tem SÓ tipos — nenhuma lógica, nenhum I/O. Existe para que a
 * camada de dados (`dashboard.ts`) e os componentes de apresentação
 * (`src/components/dashboard/*`) possam ser escritos contra a mesma forma sem
 * depender um do outro.
 *
 * Regras que valem aqui como em todo lugar: dinheiro é Int em centavos e todo
 * campo monetário termina em `Cents`; data civil é string "YYYY-MM-DD".
 */
import type { MetodoPagamento, ClassePatrimonio } from '@/domain/model/enums';
import type { Ciclo, CustoFixo, ProvisaoAnual } from '@/domain/model/entidades';
import type { DataCivil } from '@/shared/data';

/** Faixa de destaque do topo do painel. Nada aqui mistura fixo com variável. */
export interface KpisPainel {
  /** O número herói: teto de hoje menos o que já saiu hoje. Pode ser negativo. */
  restaHojeCents: number;
  tetoHojeCents: number;
  gastoHojeCents: number;
  /** Verba variável do ciclo (congelada) e quanto dela já foi consumido. */
  verbaVariavelCents: number;
  gastoRealizadoCents: number;
  /** Verba − gasto realizado. Pode ser negativo (modo recuperação). */
  saldoDisponivelCents: number;
  diasRestantes: number;
  diasTotais: number;
  /**
   * Projeção do que sobra DA VERBA VARIÁVEL no fim do ciclo, mantido o ritmo
   * atual. NÃO é a poupança do mês — a meta já foi reservada antes da verba
   * existir. Rotule como "sobra da verba", nunca como "sobra" solta.
   */
  sobraProjetadaCents: number;
  emRecuperacao: boolean;

  /** Renda prevista do ciclo (congelada). */
  rendaPrevistaCents: number;
  /** Custos fixos congelados do ciclo. Nunca somados à verba variável. */
  custosFixosCents: number;
  /** Parcelas com competência neste ciclo. */
  parceladosCicloCents: number;
  /**
   * Compromisso total do mês: fixos + parcelas + gasto variável realizado.
   * É o "Total de gastos" da planilha do usuário.
   */
  totalGastosCents: number;
  /** Meta de economia do mês = poupança alvo do ciclo. */
  metaEconomiaCents: number;
  /**
   * Saldo disponível no modelo da planilha: renda prevista − totalGastos.
   * As contas do app têm saldo 0 (o usuário não mantém saldo por conta), por
   * isso é derivado, não lido de `Conta.saldoCents`.
   */
  saldoContaCents: number;
}

/** Uma fatia do gasto variável do ciclo, por categoria. */
export interface FatiaCategoria {
  categoriaId: string;
  nome: string;
  totalCents: number;
  /** 0–100, com uma casa decimal. Só para exibição — nunca para cálculo. */
  percentual: number;
}

/** Saídas do ciclo agrupadas por método de pagamento (a tabela da planilha). */
export interface FatiaMetodo {
  /** `null` = lançamento sem método informado. */
  metodo: MetodoPagamento | null;
  totalCents: number;
  percentual: number;
}

/** Linha da tabela de parcelamentos em aberto. */
export interface LinhaParcelada {
  parcelamentoId: string;
  descricao: string;
  valorParcelaCents: number;
  parcelaAtual: number;
  numParcelas: number;
  /** Competência da parcela que cai neste ciclo. */
  data: DataCivil;
  categoriaNome: string | null;
}

/** Bloco de patrimônio/investimentos — o que a planilha do usuário não mostra. */
export interface ResumoPatrimonioPainel {
  totalCents: number;
  variacaoCents: number | null;
  mesesDeReserva: number | null;
  porClasse: { classe: ClassePatrimonio; totalCents: number }[];
  curva: { data: DataCivil; totalCents: number }[];
}

/** Metas traçadas vs. realizado — o outro furo da planilha. */
export interface ResumoMetas {
  poupancaAlvoCents: number;
  /**
   * Projeção de poupança no fechamento = alvo + sobra PROJETADA da verba pelo
   * ritmo real de gasto. Pode ficar abaixo do alvo se o usuário estourar a
   * verba (sobra projetada negativa). NUNCA use saldo-ainda-não-gasto como se
   * fosse poupado: no primeiro dia do ciclo isso dá 100% de progresso sempre,
   * e apresenta como conquistado dinheiro que ainda pode ser gasto (SPEC 13).
   */
  poupancaProjetadaCents: number;
  /**
   * A parcela da projeção que vem da verba (= projetada − alvo). Vem pronta do
   * read-model porque componente não faz aritmética monetária (SPEC 13).
   */
  sobraDaVerbaCents: number;
  /** 0–100, limitado. Quanto do alvo a projeção atual sustenta. */
  progressoPercentual: number;
  metaPoupancaPercent: number | null;
  /** Aviso da regra 12 quando a meta produz teto diário irreal. */
  avisoMetaIrreal: { irreal: boolean; verbaDiariaCents: number; pisoDiarioCents: number } | null;
}

/** Tudo que o painel desktop precisa, numa consulta só. */
export interface EstadoPainel {
  hoje: DataCivil;
  ciclo: Ciclo;
  /** Rótulo do período, ex.: "1 ago — 31 ago". Formatado na camada de dados. */
  periodoLabel: string;
  kpis: KpisPainel;
  categorias: FatiaCategoria[];
  metodos: FatiaMetodo[];
  custosFixos: CustoFixo[];
  fixosTotalCents: number;
  parcelados: LinhaParcelada[];
  parceladosTotalCents: number;
  provisoes: ProvisaoAnual[];
  provisaoMensalTotalCents: number;
  patrimonio: ResumoPatrimonioPainel;
  metas: ResumoMetas;
  /** Ciclo anterior ainda sem fechar — aviso, nunca bloqueio (regra 10). */
  pendenciaFechamento: Ciclo | null;
}
