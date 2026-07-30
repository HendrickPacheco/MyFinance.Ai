/**
 * Tipos de entrada/saída do motor de cálculo. O motor NÃO recebe entidades
 * completas nem toca no banco: recebe estas formas mínimas e devolve números.
 * Ver SPEC seção 5 ("funções puras, sem acesso a banco").
 */
import type { DataCivil } from '@/shared/data';
import type { GrupoCategoria, TipoTransacao } from '@/domain/model/enums';

/**
 * Forma mínima de uma transação para os cálculos de gasto.
 * `grupoCategoria` vem do join com Categoria; `provisaoId` marca gasto de
 * provisão (item 3) — que NÃO consome verba variável.
 */
export interface TransacaoCalc {
  data: DataCivil;
  valorCents: number;
  tipo: TipoTransacao;
  grupoCategoria?: GrupoCategoria | null;
  provisaoId?: string | null;
}

export interface LimitesCiclo {
  inicio: DataCivil;
  fim: DataCivil;
}

export interface ParametrosVerba {
  rendaPrevistaCents: number;
  poupancaAlvoCents: number;
  fixosCents: number;
  provisaoMensalCents: number;
  /** Sobra (±) herdada do ciclo anterior quando destino = ROLLOVER (item 5). */
  rolloverRecebidoCents?: number;
}

export interface EntradaTeto {
  verbaVariavelCents: number;
  dataFimCiclo: DataCivil;
  hoje: DataCivil;
  transacoes: readonly TransacaoCalc[];
}

export interface ResultadoTeto {
  diasRestantes: number;
  gastoAntesDeHojeCents: number;
  saldoDisponivelCents: number;
  tetoHojeCents: number;
  gastoHojeCents: number;
  restaHojeCents: number;
  emRecuperacao: boolean;
}
