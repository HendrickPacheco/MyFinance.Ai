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
  ProvisaoAnual,
  Transacao,
  Parcelamento,
  Ciclo,
  SnapshotPatrimonio,
} from '@/domain/model/entidades';
import type {
  ConfigRepository,
  ContaRepository,
  CategoriaRepository,
  CustoFixoRepository,
  ProvisaoRepository,
  TransacaoRepository,
  ParcelamentoRepository,
  CicloRepository,
  PatrimonioRepository,
} from '@/domain/ports/repositorios';
import {
  toConfig,
  toConta,
  toCategoria,
  toCustoFixo,
  toProvisao,
  toTransacao,
  toParcelamento,
  toCiclo,
  toSnapshot,
} from './mappers';

/** Remove undefined/id vazio para deixar o Prisma gerar defaults (cuid). */
function semIdVazio<T extends { id?: string }>(dados: T): T {
  if (!dados.id) {
    const { id: _omit, ...resto } = dados;
    return resto as T;
  }
  return dados;
}

export class PrismaConfigRepository implements ConfigRepository {
  constructor(private readonly db: PrismaClient) {}

  async obter(): Promise<Config | null> {
    const r = await this.db.config.findUnique({ where: { id: 1 } });
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
    const r = await this.db.config.upsert({
      where: { id: 1 },
      update: dados,
      create: { id: 1, ...dados },
    });
    return toConfig(r);
  }
}

export class PrismaContaRepository implements ContaRepository {
  constructor(private readonly db: PrismaClient) {}

  async listar(opcoes?: { incluirArquivadas?: boolean }): Promise<Conta[]> {
    const rows = await this.db.conta.findMany({
      where: opcoes?.incluirArquivadas ? {} : { arquivada: false },
      orderBy: { nome: 'asc' },
    });
    return rows.map(toConta);
  }

  async obter(id: string): Promise<Conta | null> {
    const r = await this.db.conta.findUnique({ where: { id } });
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
    const r = conta.id
      ? await this.db.conta.update({ where: { id: conta.id }, data: dados })
      : await this.db.conta.create({ data: dados });
    return toConta(r);
  }

  async ajustarSaldo(id: string, deltaCents: number): Promise<void> {
    await this.db.conta.update({
      where: { id },
      data: { saldoCents: { increment: deltaCents } },
    });
  }
}

export class PrismaCategoriaRepository implements CategoriaRepository {
  constructor(private readonly db: PrismaClient) {}

  async listar(): Promise<Categoria[]> {
    const rows = await this.db.categoria.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
    return rows.map(toCategoria);
  }

  async obter(id: string): Promise<Categoria | null> {
    const r = await this.db.categoria.findUnique({ where: { id } });
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
    const r = categoria.id
      ? await this.db.categoria.update({ where: { id: categoria.id }, data: dados })
      : await this.db.categoria.create({ data: dados });
    return toCategoria(r);
  }
}

export class PrismaCustoFixoRepository implements CustoFixoRepository {
  constructor(private readonly db: PrismaClient) {}

  async listarAtivos(): Promise<CustoFixo[]> {
    const rows = await this.db.custoFixo.findMany({
      where: { ativo: true },
      orderBy: { diaVencimento: 'asc' },
    });
    return rows.map(toCustoFixo);
  }

  async salvar(custo: CustoFixo): Promise<CustoFixo> {
    const dados = {
      nome: custo.nome,
      valorCents: custo.valorCents,
      diaVencimento: custo.diaVencimento,
      ativo: custo.ativo,
      contaId: custo.contaId,
    };
    const r = custo.id
      ? await this.db.custoFixo.update({ where: { id: custo.id }, data: dados })
      : await this.db.custoFixo.create({ data: dados });
    return toCustoFixo(r);
  }
}

export class PrismaProvisaoRepository implements ProvisaoRepository {
  constructor(private readonly db: PrismaClient) {}

  async listarAtivas(): Promise<ProvisaoAnual[]> {
    const rows = await this.db.provisaoAnual.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
    });
    return rows.map(toProvisao);
  }

  async salvar(provisao: ProvisaoAnual): Promise<ProvisaoAnual> {
    const dados = {
      nome: provisao.nome,
      valorAnualCents: provisao.valorAnualCents,
      mesEsperado: provisao.mesEsperado,
      acumuladoCents: provisao.acumuladoCents,
      ativo: provisao.ativo,
    };
    const r = provisao.id
      ? await this.db.provisaoAnual.update({ where: { id: provisao.id }, data: dados })
      : await this.db.provisaoAnual.create({ data: dados });
    return toProvisao(r);
  }

  async ajustarAcumulado(id: string, deltaCents: number): Promise<void> {
    await this.db.provisaoAnual.update({
      where: { id },
      data: { acumuladoCents: { increment: deltaCents } },
    });
  }
}

export class PrismaTransacaoRepository implements TransacaoRepository {
  constructor(private readonly db: PrismaClient) {}

  async obter(id: string): Promise<Transacao | null> {
    const r = await this.db.transacao.findUnique({ where: { id } });
    return r ? toTransacao(r) : null;
  }

  async listarPorCiclo(cicloId: string): Promise<Transacao[]> {
    const rows = await this.db.transacao.findMany({
      where: { cicloId },
      orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toTransacao);
  }

  async listarPorIntervalo(inicio: DataCivil, fim: DataCivil): Promise<Transacao[]> {
    const rows = await this.db.transacao.findMany({
      where: { data: { gte: inicio, lte: fim } },
      orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toTransacao);
  }

  async criar(transacao: Transacao): Promise<Transacao> {
    const r = await this.db.transacao.create({ data: semIdVazio(dadosTransacao(transacao)) });
    return toTransacao(r);
  }

  async criarVarias(transacoes: readonly Transacao[]): Promise<Transacao[]> {
    const criadas = await this.db.$transaction(
      transacoes.map((t) => this.db.transacao.create({ data: semIdVazio(dadosTransacao(t)) })),
    );
    return criadas.map(toTransacao);
  }

  async atualizar(id: string, patch: Partial<Transacao>): Promise<Transacao> {
    const r = await this.db.transacao.update({ where: { id }, data: patch });
    return toTransacao(r);
  }

  async excluir(id: string): Promise<void> {
    await this.db.transacao.delete({ where: { id } });
  }

  async vincularCicloPorData(cicloId: string, inicio: DataCivil, fim: DataCivil): Promise<number> {
    const r = await this.db.transacao.updateMany({
      where: { cicloId: null, data: { gte: inicio, lte: fim } },
      data: { cicloId },
    });
    return r.count;
  }
}

function dadosTransacao(t: Transacao) {
  return {
    id: t.id || undefined,
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
  };
}

export class PrismaParcelamentoRepository implements ParcelamentoRepository {
  constructor(private readonly db: PrismaClient) {}

  async criar(p: Parcelamento): Promise<Parcelamento> {
    const r = await this.db.parcelamento.create({
      data: semIdVazio({
        id: p.id || undefined,
        descricao: p.descricao,
        valorTotalCents: p.valorTotalCents,
        numParcelas: p.numParcelas,
        dataCompra: p.dataCompra,
        categoriaId: p.categoriaId,
      }),
    });
    return toParcelamento(r);
  }

  async listarPorIds(ids: readonly string[]): Promise<Parcelamento[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.parcelamento.findMany({ where: { id: { in: [...ids] } } });
    return rows.map(toParcelamento);
  }
}

export class PrismaCicloRepository implements CicloRepository {
  constructor(private readonly db: PrismaClient) {}

  async obter(id: string): Promise<Ciclo | null> {
    const r = await this.db.ciclo.findUnique({ where: { id } });
    return r ? toCiclo(r) : null;
  }

  async obterPorInicio(dataInicio: DataCivil): Promise<Ciclo | null> {
    const r = await this.db.ciclo.findUnique({ where: { dataInicio } });
    return r ? toCiclo(r) : null;
  }

  async obterAtual(hoje: DataCivil): Promise<Ciclo | null> {
    const r = await this.db.ciclo.findFirst({
      where: { dataInicio: { lte: hoje }, dataFim: { gte: hoje } },
    });
    return r ? toCiclo(r) : null;
  }

  async ultimoFechado(): Promise<Ciclo | null> {
    const r = await this.db.ciclo.findFirst({
      where: { fechado: true },
      orderBy: { dataInicio: 'desc' },
    });
    return r ? toCiclo(r) : null;
  }

  async ultimosFechados(n: number): Promise<Ciclo[]> {
    const rows = await this.db.ciclo.findMany({
      where: { fechado: true },
      orderBy: { dataInicio: 'desc' },
      take: n,
    });
    return rows.map(toCiclo);
  }

  async criarSeAusente(ciclo: Ciclo): Promise<{ ciclo: Ciclo; criado: boolean }> {
    try {
      const r = await this.db.ciclo.create({ data: semIdVazio(dadosCiclo(ciclo)) });
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
    const r = await this.db.ciclo.update({ where: { id }, data: patch });
    return toCiclo(r);
  }

  async fecharSePendente(id: string, patch: Partial<Ciclo>): Promise<boolean> {
    // Condição no WHERE torna a transição fechado:false -> true atômica.
    const r = await this.db.ciclo.updateMany({
      where: { id, fechado: false },
      data: patch,
    });
    return r.count === 1;
  }
}

/** Prisma P2002 = violação de constraint única (ex.: Ciclo.dataInicio). */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

function dadosCiclo(c: Ciclo) {
  return {
    id: c.id || undefined,
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
  constructor(private readonly db: PrismaClient) {}

  async ultimoSnapshot(): Promise<SnapshotPatrimonio | null> {
    const r = await this.db.snapshotPatrimonio.findFirst({
      orderBy: { data: 'desc' },
      include: { itens: true },
    });
    return r ? toSnapshot(r) : null;
  }

  async ultimosSnapshots(n: number): Promise<SnapshotPatrimonio[]> {
    const rows = await this.db.snapshotPatrimonio.findMany({
      orderBy: { data: 'desc' },
      take: n,
      include: { itens: true },
    });
    return rows.map(toSnapshot);
  }

  async criar(snapshot: SnapshotPatrimonio): Promise<SnapshotPatrimonio> {
    const r = await this.db.snapshotPatrimonio.create({
      data: {
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
