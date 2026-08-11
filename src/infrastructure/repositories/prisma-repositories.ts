/**
 * Adapters concretos das portas de persistência (arquitetura hexagonal).
 * Traduzem entre o domínio e o Prisma. O domínio nunca vê estas classes —
 * elas são montadas na composição (src/composition.ts) e injetadas nos
 * casos de uso.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type { DataCivil } from '@/shared/data';
import type {
  Config,
  Conta,
  Categoria,
  CustoFixo,
  PagamentoFixo,
  ProvisaoAnual,
  Transacao,
  Parcelamento,
  Ciclo,
  SnapshotPatrimonio,
} from '@/domain/model/entidades';
import {
  RestricaoDeIntegridadeError,
  type ConfigRepository,
  type ContaRepository,
  type CategoriaRepository,
  type CustoFixoRepository,
  type PagamentoFixoRepository,
  type ProvisaoRepository,
  type TransacaoRepository,
  type LoteTransacional,
  type ParcelamentoRepository,
  type CicloRepository,
  type PatrimonioRepository,
} from '@/domain/ports/repositorios';
import {
  toConfig,
  toConta,
  toCategoria,
  toCustoFixo,
  toPagamentoFixo,
  toProvisao,
  toTransacao,
  toParcelamento,
  toCiclo,
  toSnapshot,
} from './mappers';

/**
 * >>> ESCOPO DE DONO — a defesa contra IDOR/BOLA (TASKS-AUTH §3.2) <<<
 *
 * Todo repositório recebe o `donoId` no CONSTRUTOR, não por parâmetro de método.
 * Isso é deliberado: o `donoId` vem de `criarDeps()`, que o lê da sessão. Não há
 * nenhum caminho pelo qual um id vindo do cliente vire escopo de consulta.
 *
 * Regras que TODO método aqui segue:
 *  - leitura por id usa `findFirst({ id, donoId })`, NUNCA `findUnique({ id })`
 *    — `findUnique` não aceita filtro extra e devolveria a linha de outro dono;
 *  - escrita por id usa `updateMany`/`deleteMany` com `{ id, donoId }`, que
 *    afeta ZERO linhas quando o id é de outro dono (em vez de alterá-la);
 *  - criação sempre carimba `donoId`.
 *
 * Um `findUnique({ where: { id } })` reintroduzido neste arquivo é um vazamento
 * entre usuários. A auditoria procura por isso.
 */

/** Lançado quando um id existe, mas pertence a outro dono (ou não existe). */
export class RecursoNaoEncontradoError extends Error {
  constructor(recurso: string) {
    // Mensagem propositalmente igual para "não existe" e "é de outro usuário":
    // distinguir os casos revelaria a existência do recurso alheio.
    super(`${recurso} não encontrado.`);
    this.name = 'RecursoNaoEncontradoError';
  }
}

/** Prisma P2003 = violação de FK Restrict (registro dependente impede a exclusão). */
function ehViolacaoDeChaveEstrangeira(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2003';
}

/** Remove undefined/id vazio para deixar o Prisma gerar defaults (cuid). */
function semIdVazio<T extends { id?: string }>(dados: T): T {
  if (!dados.id) {
    const { id: _omit, ...resto } = dados;
    return resto as T;
  }
  return dados;
}

export class PrismaConfigRepository implements ConfigRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async obter(): Promise<Config | null> {
    const r = await this.db.config.findUnique({ where: { donoId: this.donoId } });
    return r ? toConfig(r) : null;
  }

  async salvar(config: Config): Promise<Config> {
    const dados = {
      rendaBaseCents: config.rendaBaseCents,
      rendaVariavel: config.rendaVariavel,
      diaRecebimento: config.diaRecebimento,
      metaPoupancaCents: config.metaPoupancaCents,
      metaPoupancaPercent: config.metaPoupancaPercent,
      moeda: config.moeda,
      timezone: config.timezone,
      destinoSobra: config.destinoSobra,
      destinoSobraContaId: config.destinoSobraContaId,
      pisoDiarioVerbaCents: config.pisoDiarioVerbaCents,
    };
    // Chave do upsert é `donoId`, não `id=1`: a Config deixou de ser singleton
    // global e passou a ser uma por dono.
    const r = await this.db.config.upsert({
      where: { donoId: this.donoId },
      update: dados,
      create: { donoId: this.donoId, ...dados },
    });
    return toConfig(r);
  }
}

export class PrismaContaRepository implements ContaRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async listar(opcoes?: { incluirArquivadas?: boolean }): Promise<Conta[]> {
    const rows = await this.db.conta.findMany({
      where: opcoes?.incluirArquivadas
        ? { donoId: this.donoId }
        : { donoId: this.donoId, arquivada: false },
      orderBy: { nome: 'asc' },
    });
    return rows.map(toConta);
  }

  async obter(id: string): Promise<Conta | null> {
    const r = await this.db.conta.findFirst({ where: { id, donoId: this.donoId } });
    return r ? toConta(r) : null;
  }

  async salvar(conta: Conta): Promise<Conta> {
    const dados = {
      nome: conta.nome,
      tipo: conta.tipo,
      saldoCents: conta.saldoCents,
      incluiPatrimonio: conta.incluiPatrimonio,
      arquivada: conta.arquivada,
    };
    if (!conta.id) {
      const criada = await this.db.conta.create({ data: { ...dados, donoId: this.donoId } });
      return toConta(criada);
    }
    const { count } = await this.db.conta.updateMany({
      where: { id: conta.id, donoId: this.donoId },
      data: dados,
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Conta');
    const r = await this.db.conta.findFirstOrThrow({ where: { id: conta.id, donoId: this.donoId } });
    return toConta(r);
  }

  async ajustarSaldo(id: string, deltaCents: number): Promise<void> {
    const { count } = await this.db.conta.updateMany({
      where: { id, donoId: this.donoId },
      data: { saldoCents: { increment: deltaCents } },
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Conta');
  }
}

export class PrismaCategoriaRepository implements CategoriaRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async listar(): Promise<Categoria[]> {
    const rows = await this.db.categoria.findMany({
      where: { donoId: this.donoId },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
    return rows.map(toCategoria);
  }

  async obter(id: string): Promise<Categoria | null> {
    const r = await this.db.categoria.findFirst({ where: { id, donoId: this.donoId } });
    return r ? toCategoria(r) : null;
  }

  async salvar(categoria: Categoria): Promise<Categoria> {
    const dados = {
      nome: categoria.nome,
      grupo: categoria.grupo,
      essencial: categoria.essencial,
      icone: categoria.icone,
      cor: categoria.cor,
      ordem: categoria.ordem,
    };
    if (!categoria.id) {
      const criada = await this.db.categoria.create({ data: { ...dados, donoId: this.donoId } });
      return toCategoria(criada);
    }
    const { count } = await this.db.categoria.updateMany({
      where: { id: categoria.id, donoId: this.donoId },
      data: dados,
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Categoria');
    const r = await this.db.categoria.findFirstOrThrow({
      where: { id: categoria.id, donoId: this.donoId },
    });
    return toCategoria(r);
  }
}

export class PrismaCustoFixoRepository implements CustoFixoRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async listarAtivos(): Promise<CustoFixo[]> {
    const rows = await this.db.custoFixo.findMany({
      where: { donoId: this.donoId, ativo: true },
      orderBy: { diaVencimento: 'asc' },
    });
    return rows.map(toCustoFixo);
  }

  async listarTodos(): Promise<CustoFixo[]> {
    const rows = await this.db.custoFixo.findMany({
      where: { donoId: this.donoId },
      orderBy: [{ ativo: 'desc' }, { diaVencimento: 'asc' }],
    });
    return rows.map(toCustoFixo);
  }

  async obter(id: string): Promise<CustoFixo | null> {
    const r = await this.db.custoFixo.findFirst({ where: { id, donoId: this.donoId } });
    return r ? toCustoFixo(r) : null;
  }

  async salvar(custo: CustoFixo): Promise<CustoFixo> {
    const dados = {
      nome: custo.nome,
      valorCents: custo.valorCents,
      diaVencimento: custo.diaVencimento,
      ativo: custo.ativo,
      contaId: custo.contaId,
      vigenteDe: custo.vigenteDe,
      vigenteAte: custo.vigenteAte,
    };
    if (!custo.id) {
      const criado = await this.db.custoFixo.create({ data: { ...dados, donoId: this.donoId } });
      return toCustoFixo(criado);
    }
    const { count } = await this.db.custoFixo.updateMany({
      where: { id: custo.id, donoId: this.donoId },
      data: dados,
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Custo fixo');
    const r = await this.db.custoFixo.findFirstOrThrow({
      where: { id: custo.id, donoId: this.donoId },
    });
    return toCustoFixo(r);
  }

  /**
   * `deleteMany` com o dono no filtro: id alheio afeta zero linhas em vez de
   * apagar a linha de outro usuário. Se houver `PagamentoFixo` apontando para
   * o custo, a FK Restrict faz o Postgres recusar (P2003), traduzido aqui
   * para `RestricaoDeIntegridadeError` — o caso de uso a converte no erro
   * nomeado e acionável ("desative em vez de excluir").
   */
  async excluir(id: string): Promise<void> {
    try {
      const { count } = await this.db.custoFixo.deleteMany({
        where: { id, donoId: this.donoId },
      });
      if (count === 0) throw new RecursoNaoEncontradoError('Custo fixo');
    } catch (erro) {
      if (ehViolacaoDeChaveEstrangeira(erro)) throw new RestricaoDeIntegridadeError('Custo fixo');
      throw erro;
    }
  }
}

/**
 * Rastreamento de "custo fixo pago no ciclo" — nunca toca `Ciclo.fixosCents`
 * nem qualquer campo de verba. `marcarPago`/`desmarcarPago` são idempotentes:
 * `upsert` na constraint única (custoFixoId, cicloId) evita duplicar ou
 * lançar em cliques repetidos.
 */
export class PrismaPagamentoFixoRepository implements PagamentoFixoRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async listarPorCiclo(cicloId: string): Promise<PagamentoFixo[]> {
    const rows = await this.db.pagamentoFixo.findMany({
      where: { cicloId, donoId: this.donoId },
    });
    return rows.map(toPagamentoFixo);
  }

  async marcarPago(custoFixoId: string, cicloId: string, pagoEm: DataCivil): Promise<PagamentoFixo> {
    // O par (custoFixoId, cicloId) só chega aqui vindo de consultas já
    // escopadas, e a criação carimba o dono — não há como marcar pago um custo
    // fixo alheio.
    const r = await this.db.pagamentoFixo.upsert({
      where: { custoFixoId_cicloId: { custoFixoId, cicloId } },
      update: { pagoEm },
      create: { custoFixoId, cicloId, pagoEm, donoId: this.donoId },
    });
    return toPagamentoFixo(r);
  }

  async desmarcarPago(custoFixoId: string, cicloId: string): Promise<void> {
    await this.db.pagamentoFixo.deleteMany({
      where: { custoFixoId, cicloId, donoId: this.donoId },
    });
  }

  async contarPorCustoFixo(custoFixoId: string): Promise<number> {
    return this.db.pagamentoFixo.count({ where: { custoFixoId, donoId: this.donoId } });
  }

  async contarPorCustoFixoAgrupado(): Promise<Record<string, number>> {
    // `groupBy` também é uma query do Prisma Client e NÃO herda escopo
    // automático (regra de ouro do multi-tenant): o `donoId` no `where` é
    // obrigatório, senão a contagem misturaria pagamentos de outro usuário.
    const linhas = await this.db.pagamentoFixo.groupBy({
      by: ['custoFixoId'],
      where: { donoId: this.donoId },
      _count: { _all: true },
    });
    return Object.fromEntries(linhas.map((l) => [l.custoFixoId, l._count._all]));
  }
}

export class PrismaProvisaoRepository implements ProvisaoRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async listarAtivas(): Promise<ProvisaoAnual[]> {
    const rows = await this.db.provisaoAnual.findMany({
      where: { donoId: this.donoId, ativo: true },
      orderBy: { nome: 'asc' },
    });
    return rows.map(toProvisao);
  }

  async listarTodas(): Promise<ProvisaoAnual[]> {
    const rows = await this.db.provisaoAnual.findMany({
      where: { donoId: this.donoId },
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
    return rows.map(toProvisao);
  }

  async obter(id: string): Promise<ProvisaoAnual | null> {
    const r = await this.db.provisaoAnual.findFirst({ where: { id, donoId: this.donoId } });
    return r ? toProvisao(r) : null;
  }

  async salvar(provisao: ProvisaoAnual): Promise<ProvisaoAnual> {
    const dados = {
      nome: provisao.nome,
      valorAnualCents: provisao.valorAnualCents,
      mesEsperado: provisao.mesEsperado,
      acumuladoCents: provisao.acumuladoCents,
      ativo: provisao.ativo,
    };
    if (!provisao.id) {
      const criada = await this.db.provisaoAnual.create({
        data: { ...dados, donoId: this.donoId },
      });
      return toProvisao(criada);
    }
    const { count } = await this.db.provisaoAnual.updateMany({
      where: { id: provisao.id, donoId: this.donoId },
      data: dados,
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Provisão');
    const r = await this.db.provisaoAnual.findFirstOrThrow({
      where: { id: provisao.id, donoId: this.donoId },
    });
    return toProvisao(r);
  }

  async ajustarAcumulado(id: string, deltaCents: number): Promise<void> {
    const { count } = await this.db.provisaoAnual.updateMany({
      where: { id, donoId: this.donoId },
      data: { acumuladoCents: { increment: deltaCents } },
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Provisão');
  }

  /**
   * Recusar quando `acumuladoCents != 0` é decisão do caso de uso — aqui só o
   * escopo por dono. A FK `Transacao.provisaoId` é Restrict: provisão com
   * gasto lançado não é apagável, e a violação (P2003) é traduzida para
   * `RestricaoDeIntegridadeError` — o caso de uso a converte no erro nomeado.
   */
  async excluir(id: string): Promise<void> {
    try {
      const { count } = await this.db.provisaoAnual.deleteMany({
        where: { id, donoId: this.donoId },
      });
      if (count === 0) throw new RecursoNaoEncontradoError('Provisão');
    } catch (erro) {
      if (ehViolacaoDeChaveEstrangeira(erro)) throw new RestricaoDeIntegridadeError('Provisão');
      throw erro;
    }
  }
}

export class PrismaTransacaoRepository implements TransacaoRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async obter(id: string): Promise<Transacao | null> {
    const r = await this.db.transacao.findFirst({ where: { id, donoId: this.donoId } });
    return r ? toTransacao(r) : null;
  }

  async listarPorCiclo(cicloId: string): Promise<Transacao[]> {
    const rows = await this.db.transacao.findMany({
      where: { cicloId, donoId: this.donoId },
      orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toTransacao);
  }

  async listarPorIntervalo(inicio: DataCivil, fim: DataCivil): Promise<Transacao[]> {
    const rows = await this.db.transacao.findMany({
      where: { donoId: this.donoId, data: { gte: inicio, lte: fim } },
      orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toTransacao);
  }

  async listarPorParcelamento(parcelamentoId: string): Promise<Transacao[]> {
    const rows = await this.db.transacao.findMany({
      where: { donoId: this.donoId, parcelamentoId },
      orderBy: [{ data: 'asc' }, { parcelaNum: 'asc' }],
    });
    return rows.map(toTransacao);
  }

  async criar(transacao: Transacao): Promise<Transacao> {
    const r = await this.db.transacao.create({
      data: semIdVazio(dadosTransacao(transacao, this.donoId)),
    });
    return toTransacao(r);
  }

  async criarVarias(transacoes: readonly Transacao[]): Promise<Transacao[]> {
    const criadas = await this.db.$transaction(
      transacoes.map((t) =>
        this.db.transacao.create({ data: semIdVazio(dadosTransacao(t, this.donoId)) }),
      ),
    );
    return criadas.map(toTransacao);
  }

  async atualizar(id: string, patch: Partial<Transacao>): Promise<Transacao> {
    const { count } = await this.db.transacao.updateMany({
      where: { id, donoId: this.donoId },
      data: patch,
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Transação');
    const r = await this.db.transacao.findFirstOrThrow({ where: { id, donoId: this.donoId } });
    return toTransacao(r);
  }

  async excluir(id: string): Promise<void> {
    // `deleteMany` e não `delete`: com id de outro dono, apaga zero linhas em
    // vez de apagar a transação alheia.
    const { count } = await this.db.transacao.deleteMany({ where: { id, donoId: this.donoId } });
    if (count === 0) throw new RecursoNaoEncontradoError('Transação');
  }

  /**
   * Tudo-ou-nada num único `$transaction` (ver a porta). Nenhuma operação aqui
   * escapa do escopo por dono:
   * - `deleteMany`/`updateMany` levam `donoId` no `where` — id alheio afeta
   *   ZERO linhas, em vez de apagar/creditar a linha de outro usuário;
   * - `create` carimba o `donoId` deste repositório, nunca um vindo do cliente.
   *
   * Consequência deliberada do `deleteMany` com `donoId`: um id que não é do
   * dono não lança, só não apaga nada. O caso de uso já leu essas transações
   * pelo mesmo repositório escopado, então isso não pode acontecer sem uma
   * escrita concorrente — e nesse caso apagar zero linhas é o certo.
   */
  async aplicarLote(lote: LoteTransacional): Promise<Transacao[]> {
    const excluir = lote.excluir ?? [];
    const criar = lote.criar ?? [];
    const ajustesConta = lote.ajustesConta ?? [];
    const ajustesProvisao = lote.ajustesProvisao ?? [];

    if (
      excluir.length === 0 &&
      criar.length === 0 &&
      ajustesConta.length === 0 &&
      ajustesProvisao.length === 0
    ) {
      return [];
    }

    const operacoes = [
      ...(excluir.length > 0
        ? [
            this.db.transacao.deleteMany({
              where: { id: { in: [...excluir] }, donoId: this.donoId },
            }),
          ]
        : []),
      ...criar.map((t) =>
        this.db.transacao.create({ data: semIdVazio(dadosTransacao(t, this.donoId)) }),
      ),
      ...ajustesConta
        .filter((a) => a.deltaCents !== 0)
        .map((a) =>
          this.db.conta.updateMany({
            where: { id: a.contaId, donoId: this.donoId },
            data: { saldoCents: { increment: a.deltaCents } },
          }),
        ),
      ...ajustesProvisao
        .filter((a) => a.deltaCents !== 0)
        .map((a) =>
          this.db.provisaoAnual.updateMany({
            where: { id: a.provisaoId, donoId: this.donoId },
            data: { acumuladoCents: { increment: a.deltaCents } },
          }),
        ),
    ];

    const resultados = await this.db.$transaction(operacoes);

    // As criações ocupam posições conhecidas: vêm logo depois do (opcional)
    // `deleteMany` e antes dos ajustes.
    const deslocamento = excluir.length > 0 ? 1 : 0;
    return resultados
      .slice(deslocamento, deslocamento + criar.length)
      .map((r) => toTransacao(r as Parameters<typeof toTransacao>[0]));
  }

  async vincularCicloPorData(cicloId: string, inicio: DataCivil, fim: DataCivil): Promise<number> {
    const r = await this.db.transacao.updateMany({
      where: { donoId: this.donoId, cicloId: null, data: { gte: inicio, lte: fim } },
      data: { cicloId },
    });
    return r.count;
  }

  async marcarPaga(transacaoId: string, pagoEm: DataCivil | null): Promise<Transacao> {
    const { count } = await this.db.transacao.updateMany({
      where: { id: transacaoId, donoId: this.donoId },
      data: { pagoEm },
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Transação');
    const r = await this.db.transacao.findFirstOrThrow({
      where: { id: transacaoId, donoId: this.donoId },
    });
    return toTransacao(r);
  }
}

function dadosTransacao(t: Transacao, donoId: string) {
  return {
    id: t.id || undefined,
    donoId,
    data: t.data,
    valorCents: t.valorCents,
    tipo: t.tipo,
    descricao: t.descricao,
    metodo: t.metodo,
    categoriaId: t.categoriaId,
    contaId: t.contaId,
    contaDestinoId: t.contaDestinoId,
    provisaoId: t.provisaoId,
    parcelamentoId: t.parcelamentoId,
    parcelaNum: t.parcelaNum,
    estornoDeId: t.estornoDeId,
    cicloId: t.cicloId,
    pagoEm: t.pagoEm,
  };
}

export class PrismaParcelamentoRepository implements ParcelamentoRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async criar(p: Parcelamento): Promise<Parcelamento> {
    const r = await this.db.parcelamento.create({
      data: semIdVazio({
        id: p.id || undefined,
        donoId: this.donoId,
        descricao: p.descricao,
        valorTotalCents: p.valorTotalCents,
        numParcelas: p.numParcelas,
        dataCompra: p.dataCompra,
        categoriaId: p.categoriaId,
        encerradoEm: p.encerradoEm,
      }),
    });
    return toParcelamento(r);
  }

  async listarPorIds(ids: readonly string[]): Promise<Parcelamento[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.parcelamento.findMany({
      where: { id: { in: [...ids] }, donoId: this.donoId },
    });
    return rows.map(toParcelamento);
  }

  async listar(): Promise<Parcelamento[]> {
    const rows = await this.db.parcelamento.findMany({
      where: { donoId: this.donoId },
      orderBy: { dataCompra: 'desc' },
    });
    return rows.map(toParcelamento);
  }

  async obter(id: string): Promise<Parcelamento | null> {
    const r = await this.db.parcelamento.findFirst({ where: { id, donoId: this.donoId } });
    return r ? toParcelamento(r) : null;
  }

  async atualizar(id: string, patch: Partial<Parcelamento>): Promise<Parcelamento> {
    // `id` e `donoId` nunca são pacientes de patch: reescrevê-los moveria o
    // parcelamento para outro dono ou quebraria o vínculo das parcelas.
    const { id: _id, ...dados } = patch;
    const { count } = await this.db.parcelamento.updateMany({
      where: { id, donoId: this.donoId },
      data: dados,
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Parcelamento');
    const r = await this.db.parcelamento.findFirstOrThrow({
      where: { id, donoId: this.donoId },
    });
    return toParcelamento(r);
  }
}

export class PrismaCicloRepository implements CicloRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async obter(id: string): Promise<Ciclo | null> {
    const r = await this.db.ciclo.findFirst({ where: { id, donoId: this.donoId } });
    return r ? toCiclo(r) : null;
  }

  async obterPorInicio(dataInicio: DataCivil): Promise<Ciclo | null> {
    // A unicidade de `dataInicio` passou a ser POR DONO na virada multi-tenant.
    const r = await this.db.ciclo.findUnique({
      where: { donoId_dataInicio: { donoId: this.donoId, dataInicio } },
    });
    return r ? toCiclo(r) : null;
  }

  async obterAtual(hoje: DataCivil): Promise<Ciclo | null> {
    const r = await this.db.ciclo.findFirst({
      where: { donoId: this.donoId, dataInicio: { lte: hoje }, dataFim: { gte: hoje } },
    });
    return r ? toCiclo(r) : null;
  }

  async ultimoFechado(): Promise<Ciclo | null> {
    const r = await this.db.ciclo.findFirst({
      where: { donoId: this.donoId, fechado: true },
      orderBy: { dataInicio: 'desc' },
    });
    return r ? toCiclo(r) : null;
  }

  async ultimosFechados(n: number): Promise<Ciclo[]> {
    const rows = await this.db.ciclo.findMany({
      where: { donoId: this.donoId, fechado: true },
      orderBy: { dataInicio: 'desc' },
      take: n,
    });
    return rows.map(toCiclo);
  }

  async criarSeAusente(ciclo: Ciclo): Promise<{ ciclo: Ciclo; criado: boolean }> {
    try {
      const r = await this.db.ciclo.create({ data: semIdVazio(dadosCiclo(ciclo, this.donoId)) });
      return { ciclo: toCiclo(r), criado: true };
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro)) throw erro;

      // Perdemos a corrida: outra chamada concorrente já inseriu o ciclo
      // deste `dataInicio` primeiro. Relemos o vencedor em vez de duplicar.
      const vencedor = await this.obterPorInicio(ciclo.dataInicio);
      if (!vencedor) {
        throw new Error(
          `violação de unicidade em Ciclo.dataInicio=${ciclo.dataInicio}, mas nenhum ciclo foi encontrado ao reler`,
        );
      }
      return { ciclo: vencedor, criado: false };
    }
  }

  async atualizar(id: string, patch: Partial<Ciclo>): Promise<Ciclo> {
    const { count } = await this.db.ciclo.updateMany({
      where: { id, donoId: this.donoId },
      data: patch,
    });
    if (count === 0) throw new RecursoNaoEncontradoError('Ciclo');
    const r = await this.db.ciclo.findFirstOrThrow({ where: { id, donoId: this.donoId } });
    return toCiclo(r);
  }

  async fecharSePendente(id: string, patch: Partial<Ciclo>): Promise<boolean> {
    // Condição no WHERE torna a transição fechado:false -> true atômica.
    const r = await this.db.ciclo.updateMany({
      where: { id, donoId: this.donoId, fechado: false },
      data: patch,
    });
    return r.count === 1;
  }
}

/** Prisma P2002 = violação de constraint única (ex.: Ciclo.dataInicio). */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

function dadosCiclo(c: Ciclo, donoId: string) {
  return {
    id: c.id || undefined,
    donoId,
    dataInicio: c.dataInicio,
    dataFim: c.dataFim,
    rendaPrevistaCents: c.rendaPrevistaCents,
    rendaRealizadaCents: c.rendaRealizadaCents,
    poupancaAlvoCents: c.poupancaAlvoCents,
    fixosCents: c.fixosCents,
    provisaoMensalCents: c.provisaoMensalCents,
    verbaVariavelCents: c.verbaVariavelCents,
    rolloverRecebidoCents: c.rolloverRecebidoCents,
    fechado: c.fechado,
    fechadoEm: c.fechadoEm,
    sobraCents: c.sobraCents,
    observacao: c.observacao,
  };
}

export class PrismaPatrimonioRepository implements PatrimonioRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async ultimoSnapshot(): Promise<SnapshotPatrimonio | null> {
    const r = await this.db.snapshotPatrimonio.findFirst({
      where: { donoId: this.donoId },
      orderBy: { data: 'desc' },
      include: { itens: true },
    });
    return r ? toSnapshot(r) : null;
  }

  async ultimosSnapshots(n: number): Promise<SnapshotPatrimonio[]> {
    const rows = await this.db.snapshotPatrimonio.findMany({
      where: { donoId: this.donoId },
      orderBy: { data: 'desc' },
      take: n,
      include: { itens: true },
    });
    return rows.map(toSnapshot);
  }

  async criar(snapshot: SnapshotPatrimonio): Promise<SnapshotPatrimonio> {
    const r = await this.db.snapshotPatrimonio.create({
      data: {
        donoId: this.donoId,
        data: snapshot.data,
        totalCents: snapshot.totalCents,
        itens: {
          create: snapshot.itens.map((i) => ({
            nome: i.nome,
            classe: i.classe,
            valorCents: i.valorCents,
          })),
        },
      },
      include: { itens: true },
    });
    return toSnapshot(r);
  }
}
