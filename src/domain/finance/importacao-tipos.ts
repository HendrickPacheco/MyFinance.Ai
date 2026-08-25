/**
 * Tipos puros da importação de fatura (I2 do `TASKS-IMPORTACAO.md`).
 *
 * Este arquivo é o CONTRATO entre a extração (que só transcreve), a
 * conciliação (função pura, `importacao.ts`) e a camada de aplicação da I3.
 * Ele não tem lógica: nenhuma função, nenhum `await`, nenhum `new Date()`.
 *
 * Duas disciplinas do repo aparecem aqui e não são negociáveis:
 *  - dinheiro é `Int` em centavos e o campo termina em `Cents`;
 *  - data civil é `string` "YYYY-MM-DD", comparada lexicograficamente.
 */
import type { DataCivil } from '@/shared/data';
import type {
  ConfiancaTranscricao,
  SinalLinhaFatura,
  TipoVeredito as TipoVereditoPersistido,
} from '@/domain/model/enums';

/**
 * O que a linha É, independentemente do sinal do número impresso. Fatura de
 * cartão imprime estorno com menos, com parênteses ou com "CR" dependendo do
 * banco — ler o sentido do caractere é como o extrator erra.
 *
 * Apelido da união canônica de `domain/model/enums.ts`: o mesmo vocabulário
 * é gravado em `ItemImportado.sinal`, e duas listas para o mesmo fato é como
 * uma delas envelhece sozinha.
 */
export type SinalLinha = SinalLinhaFatura;

/** Grau de certeza da TRANSCRIÇÃO. Enum, nunca `0..1` — float não é auditável. */
export type Confianca = ConfiancaTranscricao;

/**
 * Uma linha transcrita da fatura, antes de qualquer conciliação.
 *
 * `descricaoOriginal` e `dataOriginalTexto` são IMUTÁVEIS: são o texto cru que
 * permite conferir depois se o extrator leu certo. O que o dono edita mora em
 * campo separado, nunca por cima destes.
 */
export interface ItemExtraido {
  /** Posição na fatura. Estabiliza a UI e desempata a atribuição 1-para-1. */
  ordem: number;
  descricaoOriginal: string;
  /** SEMPRE positivo — o sentido vem de `sinal`, como em `Transacao.valorCents`. */
  valorCents: number;
  sinal: SinalLinha;
  /** Resolvida por `resolverAnoDaFatura`. `null` = ambígua, e ninguém chuta. */
  data: DataCivil | null;
  /** "12/03", "12 MAR" — auditoria de como a data foi lida. */
  dataOriginalTexto: string;
  /** Vem do TEXTO da fatura ("3/12", "PARC 03/12"), nunca de inferência. */
  parcela: { atual: number; total: number } | null;
  confianca: Confianca;
}

/** Uma `Transacao` já registrada, no formato mínimo que a conciliação precisa. */
export interface TransacaoConciliavel {
  id: string;
  data: DataCivil;
  valorCents: number;
  descricao: string | null;
  /** `null` = lançamento avulso; preenchido = parcela já gerada. */
  parcelamentoId: string | null;
  parcelaNum: number | null;
}

/** Um `CustoFixo` ativo no período da fatura. NÃO é `Transacao` — ver §7.1. */
export interface CustoFixoConciliavel {
  id: string;
  nome: string;
  valorCents: number;
  /** 1..31 — usado como desempate quando o nome não bate. */
  diaVencimento: number;
}

/** Candidato mostrado ao dono quando a linha é `AMBIGUA`. */
export interface Candidato {
  transacaoId: string;
  data: DataCivil;
  valorCents: number;
  descricao: string | null;
}

/**
 * O que fazer com a linha. **Todo veredito carrega `motivo` em texto** (D-14):
 * veredito mudo faz a UI — e o dono — inventar a causa, e já aconteceu em
 * produção com um booleano de patrimônio.
 *
 * 🔴 `CASA_CUSTO_FIXO` NUNCA pode virar `criarTransacao`. Custo fixo já está
 * descontado em `Ciclo.fixosCents`; criar transação aqui conta R$ 4.884/mês
 * duas vezes e derruba o teto diário. A ação correta é `marcarCustoFixoPago`,
 * que é rastreamento puro e não toca saldo nem verba.
 */
export type Veredito =
  | {
      tipo: 'CASA_PARCELA';
      transacaoId: string;
      parcelamentoId: string;
      parcelaNum: number;
      motivo: string;
    }
  | { tipo: 'CASA_VARIAVEL'; transacaoId: string; motivo: string }
  | { tipo: 'CASA_CUSTO_FIXO'; custoFixoId: string; jaMarcadoPago: boolean; motivo: string }
  | { tipo: 'NOVA_AVULSA'; motivo: string }
  | { tipo: 'NOVA_PARCELA_ORFA'; atual: number; total: number; motivo: string }
  | { tipo: 'AMBIGUA'; candidatos: Candidato[]; motivo: string }
  | { tipo: 'IGNORAR'; motivo: string };

export type TipoVeredito = Veredito['tipo'];

/**
 * Trava de compilação: os nomes do tipo discriminado acima e a união gravada
 * em `ItemImportado.veredito` (`domain/model/enums.ts`) têm que ser
 * EXATAMENTE os mesmos, nos dois sentidos. Acrescentar um veredito aqui e
 * esquecer de acrescentá-lo lá (ou o contrário) para de compilar neste
 * ponto, em vez de virar uma linha impossível de gravar em produção.
 */
type _VocabularioDeVereditoNaoDivergiu = [
  TipoVeredito extends TipoVereditoPersistido ? true : never,
  TipoVereditoPersistido extends TipoVeredito ? true : never,
];

/**
 * Como a linha é apresentada ao dono (§9.2, revista pela §15.7).
 *
 * A faixa é DERIVADA do veredito por função pura — a UI não recalcula regra de
 * negócio, ela só agrupa. Desde a revisão da D-18 (25/08/2026), `NOVO` também
 * é confirmado **linha a linha**: o ganho de tempo vem da faixa `JA_REGISTRADO`,
 * que não pede nada, e não de aprovar em bloco o que vai virar lançamento.
 */
export type Faixa =
  /** 1 — já registrado: nada a fazer, some da lista. */
  | 'JA_REGISTRADO'
  /** 2 — custo fixo reconhecido: `marcarCustoFixoPago`, jamais `criarTransacao`. */
  | 'CUSTO_FIXO_RECONHECIDO'
  /** 3 — novo, sem ambiguidade nenhuma: vira lançamento, confirmado um a um. */
  | 'NOVO'
  /** 4 — precisa de você: ambígua, órfã, retroativa, data ou valor inseguros. */
  | 'PRECISA_DE_VOCE'
  /** 5 — ignorado: estorno, pagamento da fatura. Colapsado, com opção de resgatar. */
  | 'IGNORADO';

/** Uma linha da fatura com o veredito da conciliação ao lado. */
export interface ItemConciliado {
  item: ItemExtraido;
  veredito: Veredito;
  faixa: Faixa;
  /**
   * A competência da linha cai num ciclo já FECHADO. Nunca entra em confirmação
   * automática: gravar retroativo mexe num ciclo que o dono já encerrou.
   */
  retroativa: boolean;
  /**
   * Chave determinística da linha, usada para reconhecer o mesmo lançamento
   * entre importações (§11, camada 3). Persistida em `ItemImportado.chaveDedup`.
   */
  chaveDedup: string;
}

/** Uma linha que a fatura trouxe e que a conciliação se recusou a interpretar. */
export interface LinhaRejeitada {
  item: ItemExtraido;
  /** D-14: sempre em texto, nunca um código mudo. */
  motivo: string;
}

export interface ResultadoConciliacao {
  itens: ItemConciliado[];
  /**
   * Valor não-inteiro, data irresolúvel: descartadas COM MOTIVO, e a importação
   * segue. Nunca chuta, nunca aborta a fatura inteira por causa de uma linha.
   */
  rejeitadas: LinhaRejeitada[];
  /**
   * Soma das linhas aceitas por sinal. Existe para ser conferida contra o total
   * impresso na fatura e EXIBIDA: divergência é sinal, não erro a esconder (D-13).
   */
  totais: {
    comprasCents: number;
    estornosCents: number;
    tarifasCents: number;
    pagamentosFaturaCents: number;
  };
}
