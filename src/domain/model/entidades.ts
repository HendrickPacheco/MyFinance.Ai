/**
 * Entidades do domínio — tipos puros que espelham o schema Prisma, mas SEM
 * depender dele. As portas (repositories) e os casos de uso falam nesses
 * tipos; os adapters de infraestrutura traduzem de/para os modelos do Prisma.
 * Assim o núcleo de regras nunca importa `@prisma/client`.
 */
import type { DataCivil } from '@/shared/data';
import type {
  TipoTransacao,
  GrupoCategoria,
  TipoConta,
  MetodoPagamento,
  DestinoSobra,
  ClassePatrimonio,
} from './enums';

export interface Config {
  id: number;
  rendaBaseCents: number;
  rendaVariavel: boolean;
  diaRecebimento: number;
  metaPoupancaCents: number;
  metaPoupancaPercent: number | null;
  moeda: string;
  timezone: string;
  destinoSobra: DestinoSobra;
  destinoSobraContaId: string | null;
  /** Piso diário configurável (regra 12) — abaixo disso, a meta de poupança é irreal. */
  pisoDiarioVerbaCents: number;
}

export interface Conta {
  id: string;
  nome: string;
  tipo: TipoConta;
  saldoCents: number;
  incluiPatrimonio: boolean;
  arquivada: boolean;
}

export interface CustoFixo {
  id: string;
  nome: string;
  valorCents: number;
  diaVencimento: number;
  ativo: boolean;
  contaId: string | null;
  /**
   * Categoria do custo fixo (G0). `null` em todo custo cadastrado antes desta
   * fase — o dono preenche na tela de custos fixos.
   *
   * Categorizar um custo fixo NÃO o mistura com a verba variável (regra 5): o
   * filtro `grupo === 'VARIAVEL'` das telas de gasto continua excluindo fixo.
   * Isto existe para a pergunta oposta — "para onde vai minha renda?" —, que é
   * respondida numa visão separada.
   */
  categoriaId: string | null;
  /**
   * Vigência — hints de PROJEÇÃO FUTURA, não vigência histórica retroativa.
   * Ciclo já nascido ignora estes campos: ele guarda o próprio `fixosCents`
   * congelado. Servem para a projeção parar de contar um custo que vai acabar,
   * e é isso que faz a verba "respirar" nos meses seguintes.
   * `null` nos dois = constante para sempre (como todo custo nasce hoje).
   */
  vigenteDe: DataCivil | null;
  vigenteAte: DataCivil | null;
}

/**
 * Marca `CustoFixo` como pago DENTRO de um ciclo específico (coluna "Pago?"
 * da planilha). Unicidade em (custoFixoId, cicloId) no schema garante
 * idempotência e o reset natural na virada do ciclo — é RASTREAMENTO puro,
 * nunca abate nada da verba (a verba já foi congelada com `Ciclo.fixosCents`
 * quando o ciclo nasceu).
 */
export interface PagamentoFixo {
  id: string;
  custoFixoId: string;
  cicloId: string;
  pagoEm: DataCivil;
}

export interface ProvisaoAnual {
  id: string;
  nome: string;
  valorAnualCents: number;
  mesEsperado: number | null;
  acumuladoCents: number;
  ativo: boolean;
}

export interface Categoria {
  id: string;
  nome: string;
  grupo: GrupoCategoria;
  essencial: boolean;
  icone: string | null;
  cor: string | null;
  ordem: number;
}

export interface Transacao {
  id: string;
  data: DataCivil;
  valorCents: number;
  tipo: TipoTransacao;
  descricao: string | null;
  metodo: MetodoPagamento | null;
  categoriaId: string | null;
  contaId: string | null;
  contaDestinoId: string | null;
  provisaoId: string | null;
  parcelamentoId: string | null;
  parcelaNum: number | null;
  estornoDeId: string | null;
  cicloId: string | null;
  /** Marcação de "parcela paga" (rastreamento — nunca abate a verba). `null` = não paga. */
  pagoEm: DataCivil | null;
}

export interface Parcelamento {
  id: string;
  descricao: string;
  valorTotalCents: number;
  numParcelas: number;
  dataCompra: DataCivil;
  categoriaId: string | null;
  /**
   * Cancelamento antecipado: as parcelas FUTURAS foram apagadas, as já pagas
   * (e as de ciclo fechado) permanecem contando no histórico. Não é delete do
   * parcelamento — a FK `Transacao.parcelamentoId` é Restrict e as parcelas
   * passadas seguem vivas. `null` = em andamento.
   */
  encerradoEm: DataCivil | null;
}

export interface Ciclo {
  id: string;
  dataInicio: DataCivil;
  dataFim: DataCivil;
  rendaPrevistaCents: number;
  rendaRealizadaCents: number | null;
  poupancaAlvoCents: number;
  fixosCents: number;
  provisaoMensalCents: number;
  verbaVariavelCents: number;
  rolloverRecebidoCents: number;
  fechado: boolean;
  fechadoEm: DataCivil | null;
  sobraCents: number | null;
  observacao: string | null;
}

export interface ItemPatrimonio {
  id: string;
  snapshotId: string;
  nome: string;
  classe: ClassePatrimonio;
  valorCents: number;
  /**
   * Conta do razão que este item fotografa, quando existe uma. `null` para
   * patrimônio que o app não movimenta (imóvel, cripto em custódia própria).
   * Só item ligado entra na conciliação.
   */
  contaId: string | null;
}

export interface SnapshotPatrimonio {
  id: string;
  data: DataCivil;
  totalCents: number;
  itens: ItemPatrimonio[];
}

// ── Conversas do copiloto (Fase 1 da persistência) ─────────────────────────
// `Proveniencia` espelha, na FORMA, o que `RespostaCopiloto` (application/ia/
// copiloto.ts) e `PropostaExibivel` (application/ia/propostas.ts) já expõem —
// o domínio nunca importa a camada de aplicação, então os campos são
// reescritos aqui como estrutura pura. Ela existe SÓ para a UI re-renderizar o
// cartão de ferramentas/propostas/alerta depois de um reload: nunca volta ao
// modelo de IA, que só recebe `MensagemConversa.conteudo` como histórico.

export type PapelMensagemConversa = 'usuario' | 'assistente';

/** Uma ferramenta consultada no turno que gerou esta mensagem. */
export interface ProvenienciaFerramenta {
  nome: string;
  argumentos: unknown;
  /** Função pura de origem, para a UI exibir proveniência. `null` quando a
   * ferramenta não expôs isso. */
  comoFoiCalculado: string | null;
  falhou: boolean;
}

/** Um valor em R$ do texto final que veio comprovadamente de uma ferramenta. */
export interface ProvenienciaValorCitado {
  valorFormatado: string;
  ferramenta: string;
  campo: string;
}

/**
 * Espelha `PropostaExibivel` só na forma exibível — o dado bruto não é
 * revalidado aqui porque nada aqui grava: `confirmarProposta` sempre refaz o
 * schema (`propostaSchema.parse`) do zero a partir do que a UI mandar de
 * volta, exatamente como faria com uma proposta recém-chegada do modelo.
 */
export interface ProvenienciaProposta {
  proposta: Record<string, unknown>;
  resumo: string;
  detalhes: { rotulo: string; valor: string }[];
}

export interface Proveniencia {
  ferramentasUsadas: ProvenienciaFerramenta[];
  valoresCitados: ProvenienciaValorCitado[];
  /**
   * Valor em R$ que nenhuma ferramenta devolveu, mas que o PRÓPRIO DONO já
   * tinha informado nesta conversa (pergunta atual ou turno anterior). Origem
   * conhecida — nunca aciona o alerta de alucinação (caso real 11/08/2026, ver
   * `application/ia/copiloto.ts: centsInformadosPeloDono`).
   */
  valoresInformados: string[];
  /** Valor em R$ que nenhuma ferramenta devolveu E que o dono não informou —
   * o alerta de alucinação. */
  valoresNaoRastreados: string[];
  propostas: ProvenienciaProposta[];
  /** Resposta sem nenhuma ferramenta é opinião, não dado. */
  semFerramenta: boolean;
  /** `true` quando o loop do agente foi cortado pelo limite de turnos. */
  incompleta: boolean;
}

export interface Conversa {
  id: string;
  titulo: string;
  criadaEm: Date;
  atualizadaEm: Date;
}

export interface MensagemConversa {
  id: string;
  conversaId: string;
  papel: PapelMensagemConversa;
  conteudo: string;
  /**
   * `null` para mensagens de `usuario` (que nunca têm proveniência) e para
   * respostas de `assistente` sem nenhuma ferramenta, proposta ou alerta a
   * guardar.
   */
  proveniencia: Proveniencia | null;
  criadaEm: Date;
}
