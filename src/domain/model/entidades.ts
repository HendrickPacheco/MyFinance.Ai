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
