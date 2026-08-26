/**
 * Porta da persistência do rascunho de importação de fatura (I3 do
 * `TASKS-IMPORTACAO.md`). O domínio não sabe que existe Prisma nem
 * transação SQL — sabe apenas que dá para gravar um rascunho recém-extraído
 * (cabeçalho + itens de uma vez), reconhecer um documento já visto pelo hash
 * (§11 camada 1), reler um rascunho com os itens, decidir uma linha e
 * confirmar ou descartar a importação inteira.
 *
 * A conciliação em si (função pura que produz `ItemConciliado`/`Veredito`)
 * vive em `domain/finance/importacao.ts` — esta porta só grava o que já foi
 * decidido em outra camada, exatamente como `ConversaPort`.
 */
import type {
  AlvoTipoItemImportado,
  ConfiancaItemImportado,
  DecisaoItemImportado,
  Importacao,
  ItemImportado,
  OrigemImportacao,
  SinalItemImportado,
  VereditoItemImportado,
} from '@/domain/model/entidades';
import type { DataCivil } from '@/shared/data';

/** Uma linha a gravar junto do cabeçalho, em `criarRascunho`. Nasce sempre `PENDENTE`. */
export interface NovoItemImportado {
  ordem: number;
  descricaoOriginal: string;
  valorCents: number;
  sinal: SinalItemImportado;
  data: DataCivil | null;
  dataOriginalTexto: string;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  confianca: ConfiancaItemImportado;
  veredito: VereditoItemImportado;
  vereditoMotivo: string;
  alvoTipo: AlvoTipoItemImportado | null;
  alvoId: string | null;
  chaveDedup: string;
}

/** Cabeçalho + itens do rascunho recém-extraído, ainda sem id. */
export interface NovaImportacao {
  origem: OrigemImportacao;
  nomeArquivo: string | null;
  hashConteudo: string;
  competenciaRef: string;
  tokensEntrada: number;
  tokensSaida: number;
  itens: readonly NovoItemImportado[];
}

export interface ImportacaoComItens {
  importacao: Importacao;
  /** Em ordem de `ordem` crescente — a mesma ordem da fatura original. */
  itens: ItemImportado[];
}

/**
 * O que `registrarDecisao` aceita. `PENDENTE` fica de fora de propósito: é o
 * estado de nascença de todo item (`criarRascunho`), nunca um destino de
 * decisão — não existe caminho de produto que "desdecida" uma linha.
 */
export type DecisaoRegistravel = Exclude<DecisaoItemImportado, 'PENDENTE'>;

export interface ImportacaoRepository {
  /**
   * Grava cabeçalho e itens de uma vez, num único write atômico (nested
   * create do Prisma — falha em qualquer item reverte o cabeçalho também):
   * um rascunho pela metade é pior que nenhum.
   */
  criarRascunho(dados: NovaImportacao): Promise<ImportacaoComItens>;

  /**
   * Reconhece um documento já visto pelo hash (§11 camada 1). `null` quando
   * este dono nunca viu este hash — o mesmo hash em OUTRO dono é caso
   * legítimo e não aparece aqui, porque a unicidade no banco é composta com
   * `donoId`.
   */
  obterPorHash(hashConteudo: string): Promise<ImportacaoComItens | null>;

  /**
   * Um rascunho por id, com os itens. `null` quando o id não existe OU
   * pertence a outro dono — indistinguíveis de propósito (regra de ouro do
   * multi-tenant).
   */
  obter(id: string): Promise<ImportacaoComItens | null>;

  /** As últimas importações do dono (sem itens), mais recentes primeiro. */
  listar(limite?: number): Promise<Importacao[]>;

  /**
   * Registra a decisão de UMA linha. Id de item de outro dono afeta zero
   * linhas — nunca decide a linha alheia.
   */
  registrarDecisao(itemId: string, decisao: DecisaoRegistravel): Promise<void>;

  /** Marca o rascunho como confirmado (§11 camada 1 passa a reconhecê-lo). */
  marcarConfirmada(id: string): Promise<void>;

  /** Marca o rascunho como descartado. */
  marcarDescartada(id: string): Promise<void>;

  /**
   * Reabre uma linha já decidida, devolvendo-a a `PENDENTE` — a contraparte
   * de `registrarDecisao`, que de propósito nunca aceita `PENDENTE` como
   * destino (comentário de `DecisaoRegistravel` acima): aquele é o caminho
   * FORWARD de uma decisão nova, este é o único caminho de "desdecidir".
   * Existe só para o desfazer de importação inteira (I4,
   * `TASKS-IMPORTACAO.md` §15.4): depois que o efeito financeiro da linha
   * (se houve algum) já foi revertido em outra tabela, a linha volta ao
   * estado de nascença.
   */
  reabrirItem(itemId: string): Promise<void>;
}
