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
import type { ConsumoVerbas, DivergenciaCongelado, ExplicacaoPiso } from '@/domain/finance';
import type { MoedaRenda } from '@/domain/model/enums';
import type { DataCivil } from '@/shared/data';

/** Faixa de destaque do topo do painel. Nada aqui mistura fixo com variável. */
export interface KpisPainel {
  /**
   * O número herói, do DIA A DIA (D1): teto de hoje menos o que já saiu hoje.
   * Igual a `verbas.tetoDiaADia.restaHojeCents` — "Posso gastar hoje" é um
   * número só no app. Pode ser negativo.
   */
  restaHojeCents: number;
  /** O que a tela mostra como "Posso gastar hoje": `restaHojeCents` sem sinal negativo (igual a `verbas.podeGastarHojeCents`). */
  podeGastarHojeCents: number;
  tetoHojeCents: number;
  /** Gasto de hoje que consome o dia a dia (extras não entram). */
  gastoHojeCents: number;
  /** Dia a dia restante antes de hoje — o dividendo do teto de hoje. */
  saldoDiaADiaCents: number;
  /** Verba variável do ciclo (congelada) e quanto dela já foi consumido. */
  verbaVariavelCents: number;
  gastoRealizadoCents: number;
  /** Verba − gasto realizado. Pode ser negativo (modo recuperação). */
  saldoDisponivelCents: number;
  diasRestantes: number;
  diasTotais: number;
  /**
   * Projeção do que sobra DA VERBA VARIÁVEL no fim do ciclo, mantido o ritmo
   * atual. D-16: é ESTA sobra que vira a poupança do mês — a meta não foi
   * reservada em lugar nenhum. Rotule como "sobra da verba", nunca como
   * "sobra" solta.
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
   * Compromissos do mês (fixos + parcelas) ainda NÃO marcados como pagos.
   * "O que ainda vai sair da conta". Rastreamento — não altera a verba.
   */
  faltaPagarCents: number;
  /** Compromissos do mês já marcados como pagos. */
  jaPagueiCents: number;
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
  /** Transação desta parcela — é o alvo do "marcar como pago". */
  transacaoId: string;
  descricao: string;
  valorParcelaCents: number;
  parcelaAtual: number;
  numParcelas: number;
  /** Competência da parcela que cai neste ciclo. */
  data: DataCivil;
  categoriaNome: string | null;
  /** Marcado como pago pelo usuário. Rastreamento, NUNCA entra no cálculo. */
  pago: boolean;
}

/**
 * Linha da lista de custos fixos, com o estado de pagamento DESTE ciclo.
 *
 * "Pago" é por ciclo e reseta na virada do mês (igual à coluna Pago? da
 * planilha). É rastreamento puro: o valor do fixo já foi descontado da verba
 * quando o ciclo nasceu, então marcar como pago NÃO pode abater nada de novo —
 * seria contar o mesmo dinheiro duas vezes e derrubar o teto diário sem motivo.
 */
export interface LinhaCustoFixo {
  custoFixoId: string;
  nome: string;
  valorCents: number;
  diaVencimento: number;
  pago: boolean;
  /** Vencimento já passou dentro deste ciclo e continua não pago. */
  vencido: boolean;
}

/** Opção de categoria para o formulário de lançamento do painel. */
export interface OpcaoCategoria {
  id: string;
  nome: string;
  /** VARIAVEL na frente: é o que o lançamento rápido usa. */
  grupo: 'VARIAVEL' | 'FIXO' | 'RENDA';
}

/**
 * Linha do extrato de gastos variáveis do ciclo — o que NÃO é custo fixo,
 * parcela nem gasto de provisão. É o único dinheiro que consome verba de
 * forma discricionária, então é o que o usuário precisa revisar.
 */
export interface LinhaTransacaoVariavel {
  transacaoId: string;
  data: DataCivil;
  descricao: string | null;
  valorCents: number;
  categoriaId: string | null;
  categoriaNome: string | null;
  metodo: MetodoPagamento | null;
  /** ESTORNO abate; a UI precisa distinguir para não mostrar como despesa. */
  ehEstorno: boolean;
  /**
   * Competência ainda no futuro dentro deste ciclo: já lançada, mas ainda não
   * consome verba nem entra em `transacoesVariaveisTotalCents`. A UI marca a
   * linha como "programado" — some-la do extrato fazia a transação ficar
   * invisível no painel inteiro.
   */
  ehProgramado: boolean;
}

/** Bloco de patrimônio/investimentos — o que a planilha do usuário não mostra. */
export interface ResumoPatrimonioPainel {
  totalCents: number;
  variacaoCents: number | null;
  mesesDeReserva: number | null;
  porClasse: { classe: ClassePatrimonio; totalCents: number }[];
  curva: { data: DataCivil; totalCents: number }[];
}

/**
 * Meta (objetivo, D-16) vs. o que foi guardado DE VERDADE (variação do
 * patrimônio, D3). Nada aqui é "reservado": a meta continua dentro da verba.
 */
export interface ResumoMetas {
  poupancaAlvoCents: number;
  /** Estimativa em curso; `null` quando falta o patrimônio de partida (motivo ao lado, D-14). */
  guardadoCents: number | null;
  estimado: true;
  fonte: 'SNAPSHOT' | 'SALDO_CONTAS' | null;
  motivoSemGuardado: string | null;
  /** guardado − meta; `null` sem guardado. */
  diferencaCents: number | null;
  /** guardado / meta em %, uma casa; `null` sem guardado ou com meta 0. */
  percentualReal: number | null;
  /** Sobra projetada da verba pelo ritmo atual (D-16: é ela que vira poupança). */
  sobraDaVerbaCents: number;
  metaPoupancaPercent: number | null;
  /** Por que o dia a dia não cobre o piso — `null` quando cobre. */
  avisoPiso: ExplicacaoPiso | null;
}

/**
 * Split dia a dia / extras (D1) com o piso que o gerou. `diaADiaPorDiaCents` =
 * dia a dia efetivo ÷ dias do ciclo — o "reduziu seu dia a dia para R$ X/dia".
 */
export type ResumoVerbas = ConsumoVerbas & { pisoDiarioCents: number; diaADiaPorDiaCents: number };

/** Renda do ciclo: a real confirmada quando houver, senão a prevista (D8). */
export interface ResumoRendaCiclo {
  moeda: MoedaRenda;
  brutaOrigemCents: number | null;
  taxaMicros: number | null;
  dataCotacao: DataCivil | null;
  /** Imposto da decomposição; `null` quando ela não fecha com o congelado (config mudou). */
  impostoCents: number | null;
  liquidaCents: number;
  confirmada: boolean;
  decomposicao: string;
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
  custosFixos: LinhaCustoFixo[];
  fixosTotalCents: number;
  /** Congelado do ciclo (`fixosTotalCents`) vs. cadastro de hoje — ver `divergenciaCongelado`. */
  divergenciaFixos: DivergenciaCongelado;
  parcelados: LinhaParcelada[];
  parceladosTotalCents: number;
  provisoes: ProvisaoAnual[];
  provisaoMensalTotalCents: number;
  /** Congelado do ciclo (`provisaoMensalTotalCents`) vs. cadastro de hoje — ver `divergenciaCongelado`. */
  divergenciaProvisao: DivergenciaCongelado;
  /**
   * Categorias para o formulário de lançamento do painel, VARIAVEL primeiro e
   * ordenadas por frequência real de uso no ciclo (as mais usadas na frente).
   */
  categoriasLancamento: OpcaoCategoria[];
  /**
   * Extrato de gastos variáveis do ciclo INTEIRO (inclusive competência
   * futura, marcada com `ehProgramado`), mais recentes primeiro.
   */
  transacoesVariaveis: LinhaTransacaoVariavel[];
  /** Soma líquida (DESPESA − ESTORNO) só do que já foi REALIZADO (até hoje). */
  transacoesVariaveisTotalCents: number;
  /**
   * Soma líquida só das linhas programadas (competência futura). Campo
   * SEPARADO de propósito: não consome verba nem entra em `totalGastosCents` —
   * juntar os dois num número só faria o painel mostrar como gasto dinheiro
   * que ainda não saiu.
   */
  transacoesVariaveisProgramadasCents: number;
  patrimonio: ResumoPatrimonioPainel;
  metas: ResumoMetas;
  verbas: ResumoVerbas;
  renda: ResumoRendaCiclo;
  /** Ciclo anterior ainda sem fechar — aviso, nunca bloqueio (regra 10). */
  pendenciaFechamento: Ciclo | null;
}
