/**
 * Adapter de `ImportacaoRepository` (I3 do `TASKS-IMPORTACAO.md`).
 *
 * Segue a mesma disciplina de `prisma-repositories.ts` (regra de ouro do
 * multi-tenant, CLAUDE.md):
 *  - leitura por id usa `findFirst({ id, donoId })`, NUNCA `findUnique({ id })`;
 *  - escrita por id usa `updateMany` com `{ id, donoId }` — `count === 0` vira
 *    `RecursoNaoEncontradoError`;
 *  - criação carimba `donoId`, inclusive nos ITENS (a coluna existe nos dois
 *    por decisão explícita: permite filtrar/apagar por `(id, donoId)` sem join);
 *  - `obterPorHash` filtra por `{ donoId, hashConteudo }` — a unicidade no
 *    banco é composta, e o mesmo hash em dois donos é caso LEGÍTIMO.
 *
 * Mapeamento Prisma -> domínio fica LOCAL a este arquivo (e não em
 * `mappers.ts`): a I3 roda em paralelo com outros agentes tocando arquivos
 * disjuntos, e `mappers.ts` não está no escopo desta tarefa.
 */
import type {
  Importacao as PImportacao,
  ItemImportado as PItemImportado,
  PrismaClient,
} from '@prisma/client';
import type {
  AlvoTipoItemImportado,
  ConfiancaItemImportado,
  DecisaoItemImportado,
  Importacao,
  ItemImportado,
  OrigemImportacao,
  SinalItemImportado,
  StatusImportacao,
  VereditoItemImportado,
} from '@/domain/model/entidades';
import type {
  DecisaoRegistravel,
  ImportacaoComItens,
  ImportacaoRepository,
  NovaImportacao,
} from '@/domain/ports/importacao';
import { RecursoNaoEncontradoError } from './prisma-repositories';

/** Ordem estável de exibição — a mesma ordem da fatura original. */
const ORDEM_ITENS = { ordem: 'asc' as const };

function toImportacao(r: PImportacao): Importacao {
  return {
    id: r.id,
    origem: r.origem as OrigemImportacao,
    nomeArquivo: r.nomeArquivo,
    hashConteudo: r.hashConteudo,
    competenciaRef: r.competenciaRef,
    status: r.status as StatusImportacao,
    tokensEntrada: r.tokensEntrada,
    tokensSaida: r.tokensSaida,
    criadaEm: r.criadaEm,
    confirmadaEm: r.confirmadaEm,
  };
}

function toItemImportado(r: PItemImportado): ItemImportado {
  return {
    id: r.id,
    importacaoId: r.importacaoId,
    ordem: r.ordem,
    descricaoOriginal: r.descricaoOriginal,
    valorCents: r.valorCents,
    sinal: r.sinal as SinalItemImportado,
    data: r.data,
    dataOriginalTexto: r.dataOriginalTexto,
    parcelaAtual: r.parcelaAtual,
    parcelaTotal: r.parcelaTotal,
    confianca: r.confianca as ConfiancaItemImportado,
    veredito: r.veredito as VereditoItemImportado,
    vereditoMotivo: r.vereditoMotivo,
    alvoTipo: r.alvoTipo as AlvoTipoItemImportado | null,
    alvoId: r.alvoId,
    decisao: r.decisao as DecisaoItemImportado,
    chaveDedup: r.chaveDedup,
  };
}

function toImportacaoComItens(r: PImportacao & { itens: PItemImportado[] }): ImportacaoComItens {
  return {
    importacao: toImportacao(r),
    itens: r.itens.map(toItemImportado),
  };
}

export class PrismaImportacaoRepository implements ImportacaoRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  /**
   * Nested `create` (cabeçalho + itens) é UM write só para o Prisma — falha em
   * qualquer item reverte o cabeçalho, sem precisar de `$transaction`
   * explícito. `donoId` é carimbado nos dois níveis: o do cabeçalho vem do
   * construtor, e cada item leva o mesmo, nunca um vindo do chamador.
   */
  async criarRascunho(dados: NovaImportacao): Promise<ImportacaoComItens> {
    const criada = await this.db.importacao.create({
      data: {
        donoId: this.donoId,
        origem: dados.origem,
        nomeArquivo: dados.nomeArquivo,
        hashConteudo: dados.hashConteudo,
        competenciaRef: dados.competenciaRef,
        tokensEntrada: dados.tokensEntrada,
        tokensSaida: dados.tokensSaida,
        itens: {
          create: dados.itens.map((item) => ({
            donoId: this.donoId,
            ordem: item.ordem,
            descricaoOriginal: item.descricaoOriginal,
            valorCents: item.valorCents,
            sinal: item.sinal,
            data: item.data,
            dataOriginalTexto: item.dataOriginalTexto,
            parcelaAtual: item.parcelaAtual,
            parcelaTotal: item.parcelaTotal,
            confianca: item.confianca,
            veredito: item.veredito,
            vereditoMotivo: item.vereditoMotivo,
            alvoTipo: item.alvoTipo,
            alvoId: item.alvoId,
            chaveDedup: item.chaveDedup,
          })),
        },
      },
      include: { itens: { orderBy: ORDEM_ITENS } },
    });
    return toImportacaoComItens(criada);
  }

  /**
   * `{ donoId, hashConteudo }`, nunca só `{ hashConteudo }` — a unicidade no
   * banco é composta (`@@unique([donoId, hashConteudo])`), e o mesmo hash em
   * outro dono é caso LEGÍTIMO (fatura idêntica de valor, duas pessoas, mesmo
   * cartão de afiliados). Poderia usar `findUnique` com o nome da constraint
   * composta (`donoId_hashConteudo`), mas `findFirst` com os dois campos no
   * `where` chega ao mesmo resultado sem acoplar este método ao nome que o
   * Prisma gera para a chave.
   */
  async obterPorHash(hashConteudo: string): Promise<ImportacaoComItens | null> {
    const linha = await this.db.importacao.findFirst({
      where: { donoId: this.donoId, hashConteudo },
      include: { itens: { orderBy: ORDEM_ITENS } },
    });
    return linha ? toImportacaoComItens(linha) : null;
  }

  async obter(id: string): Promise<ImportacaoComItens | null> {
    const linha = await this.db.importacao.findFirst({
      where: { id, donoId: this.donoId },
      include: { itens: { orderBy: ORDEM_ITENS } },
    });
    return linha ? toImportacaoComItens(linha) : null;
  }

  async listar(limite = 20): Promise<Importacao[]> {
    const linhas = await this.db.importacao.findMany({
      where: { donoId: this.donoId },
      orderBy: { criadaEm: 'desc' },
      take: limite,
    });
    return linhas.map(toImportacao);
  }

  /**
   * `updateMany` com `{ id: itemId, donoId }`: decidir a linha de outro dono
   * afeta ZERO linhas, em vez de gravar a decisão na linha alheia.
   */
  async registrarDecisao(itemId: string, decisao: DecisaoRegistravel): Promise<void> {
    const { count } = await this.db.itemImportado.updateMany({
      where: { id: itemId, donoId: this.donoId },
      data: { decisao },
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Item de importação');
  }

  async marcarConfirmada(id: string): Promise<void> {
    const { count } = await this.db.importacao.updateMany({
      where: { id, donoId: this.donoId },
      data: { status: 'CONFIRMADA', confirmadaEm: new Date() },
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Importação');
  }

  async marcarDescartada(id: string): Promise<void> {
    const { count } = await this.db.importacao.updateMany({
      where: { id, donoId: this.donoId },
      data: { status: 'DESCARTADA' },
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Importação');
  }
}
