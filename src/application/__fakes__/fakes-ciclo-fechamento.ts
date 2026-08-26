/**
 * Fakes em memória das portas de `src/domain/ports/repositorios.ts`.
 *
 * Usados por `ciclos.test.ts` e `fechamento.test.ts`. NUNCA tocam o banco
 * real (`./data/app.db`) — tudo vive em arrays. Dinheiro é sempre Int em
 * centavos; data civil é sempre string "YYYY-MM-DD".
 */
import type { RelogioPort } from '@/domain/ports/relogio';
import {
  RestricaoDeIntegridadeError,
  ItemImportadoJaGravadoError,
  type ConfigRepository,
  type ContaRepository,
  type CategoriaRepository,
  type CustoFixoRepository,
  type PagamentoFixoRepository,
  type ProvisaoRepository,
  type TransacaoRepository,
  type ParcelamentoRepository,
  type CicloRepository,
  type PatrimonioRepository,
} from '@/domain/ports/repositorios';
import type {
  Categoria,
  Ciclo,
  Config,
  Conta,
  Conversa,
  CustoFixo,
  Importacao,
  ItemImportado,
  MensagemConversa,
  PagamentoFixo,
  Parcelamento,
  ProvisaoAnual,
  SnapshotPatrimonio,
  Transacao,
} from '@/domain/model/entidades';
import type { DataCivil } from '@/shared/data';
import type { Deps } from '../deps';
import { RelogioFixo } from '@/infrastructure/relogio/relogio-sistema';
import type { Ator } from '@/domain/auth/ator';
import type { UsoIADia, UsoIARepository } from '@/domain/ports/uso-ia';
import type {
  Memoria,
  MemoriaComRelevancia,
  MemoriaPort,
  NovaMemoria,
} from '@/domain/ports/memoria';
import type { TipoMemoria } from '@/domain/memoria/regras';
import type { EmbeddingPort, ResultadoEmbedding } from '@/domain/ports/embeddings';
import { ErroProvedorIA } from '@/domain/ports/ia';
import type { Usuario } from '@/domain/auth/usuario';
import type { SessaoPort } from '@/domain/ports/sessao';
import type { HashSenhaPort } from '@/domain/ports/hash-senha';
import type { RateLimiterPort } from '@/domain/ports/rate-limiter';
import { EmailJaUsadoError, type NovoUsuario, type UsuarioRepository } from '@/domain/ports/usuarios';
import type { ConversaComMensagens, ConversaPort, NovoTurno } from '@/domain/ports/conversa';
import type {
  DecisaoRegistravel,
  ImportacaoComItens,
  ImportacaoRepository,
  NovaImportacao,
} from '@/domain/ports/importacao';

function clone<T>(v: T): T {
  return structuredClone(v);
}

/** Acesso ao primeiro item com erro explícito (evita `!` sob noUncheckedIndexedAccess). */
export function primeiro<T>(itens: readonly T[]): T {
  const [item] = itens;
  if (item === undefined) throw new Error('coleção vazia');
  return item;
}

/** Acesso por índice com erro explícito. */
export function em<T>(itens: readonly T[], indice: number): T {
  const item = itens[indice];
  if (item === undefined) throw new Error(`índice fora da coleção: ${indice}`);
  return item;
}

export class FakeConfigRepo implements ConfigRepository {
  public salvarChamadas = 0;
  constructor(private atual: Config | null) {}

  async obter(): Promise<Config | null> {
    return this.atual ? clone(this.atual) : null;
  }

  async salvar(config: Config): Promise<Config> {
    this.salvarChamadas += 1;
    this.atual = clone(config);
    return clone(this.atual);
  }

  /** Edita a Config "por fora" (simula o usuário mexendo na configuração). */
  mutar(patch: Partial<Config>): void {
    if (!this.atual) throw new Error('sem config');
    this.atual = { ...this.atual, ...patch };
  }
}

export class FakeCicloRepo implements CicloRepository {
  public criarChamadas = 0;
  public fecharSePendenteChamadas = 0;
  private seq = 0;
  constructor(public itens: Ciclo[] = []) {}

  async obter(id: string): Promise<Ciclo | null> {
    const c = this.itens.find((x) => x.id === id);
    return c ? clone(c) : null;
  }

  async obterPorInicio(dataInicio: DataCivil): Promise<Ciclo | null> {
    const c = this.itens.find((x) => x.dataInicio === dataInicio);
    return c ? clone(c) : null;
  }

  async obterAtual(hoje: DataCivil): Promise<Ciclo | null> {
    const c = this.itens.find((x) => x.dataInicio <= hoje && hoje <= x.dataFim);
    return c ? clone(c) : null;
  }

  async ultimoFechado(): Promise<Ciclo | null> {
    return (await this.ultimosFechados(1))[0] ?? null;
  }

  async ultimosFechados(n: number): Promise<Ciclo[]> {
    return this.itens
      .filter((c) => c.fechado)
      .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio))
      .slice(0, n)
      .map(clone);
  }

  /**
   * Simula a constraint única de `dataInicio` do schema real: checagem e
   * inserção acontecem em código síncrono (sem `await` entre elas), então o
   * event loop de JS não intercala outra chamada no meio — assim como a
   * constraint do Postgres torna a inserção atômica sob corrida real. Só
   * NÃO reproduz o caso em que duas conexões de banco fisicamente distintas
   * correm em paralelo (paralelismo real, não apenas concorrência
   * cooperativa); no fake tudo roda numa única thread.
   */
  async criarSeAusente(ciclo: Ciclo): Promise<{ ciclo: Ciclo; criado: boolean }> {
    const existente = this.itens.find((x) => x.dataInicio === ciclo.dataInicio);
    if (existente) return { ciclo: clone(existente), criado: false };

    this.criarChamadas += 1;
    this.seq += 1;
    const novo: Ciclo = { ...clone(ciclo), id: `ciclo-${this.seq}` };
    this.itens.push(novo);
    return { ciclo: clone(novo), criado: true };
  }

  async atualizar(id: string, patch: Partial<Ciclo>): Promise<Ciclo> {
    const i = this.itens.findIndex((c) => c.id === id);
    const alvo = this.itens[i];
    if (!alvo) throw new Error(`ciclo inexistente: ${id}`);
    const atualizado: Ciclo = { ...alvo, ...clone(patch) };
    this.itens[i] = atualizado;
    return clone(atualizado);
  }

  async fecharSePendente(id: string, patch: Partial<Ciclo>): Promise<boolean> {
    this.fecharSePendenteChamadas += 1;
    const i = this.itens.findIndex((c) => c.id === id);
    const alvo = this.itens[i];
    if (!alvo) return false;
    if (alvo.fechado) return false; // transição atômica: só quem achar aberto fecha
    this.itens[i] = { ...alvo, ...clone(patch) };
    return true;
  }
}

export class FakeContaRepo implements ContaRepository {
  public ajustes: Array<{ id: string; deltaCents: number }> = [];
  private seq = 0;
  constructor(public itens: Conta[] = []) {}

  async listar(opcoes?: { incluirArquivadas?: boolean }): Promise<Conta[]> {
    const inclui = opcoes?.incluirArquivadas ?? false;
    return this.itens.filter((c) => inclui || !c.arquivada).map(clone);
  }

  async obter(id: string): Promise<Conta | null> {
    const c = this.itens.find((x) => x.id === id);
    return c ? clone(c) : null;
  }

  /**
   * Espelha `PrismaContaRepository.salvar`: `id` vazio é criação (o adapter
   * deixa o Postgres gerar o cuid; aqui geramos um id sequencial), `id`
   * preenchido é update por id existente. Sem isto, dois `criar` seguidos com
   * `id: ''` (como `contaSchema` em `actions/config.ts` monta) colidiam no
   * mesmo item — o segundo `findIndex` casava com o primeiro e o sobrescrevia.
   */
  async salvar(conta: Conta): Promise<Conta> {
    if (!conta.id) {
      this.seq += 1;
      const criada: Conta = { ...clone(conta), id: `conta-${this.seq}` };
      this.itens.push(criada);
      return clone(criada);
    }
    const i = this.itens.findIndex((c) => c.id === conta.id);
    if (i < 0) throw new Error(`conta inexistente: ${conta.id}`);
    this.itens[i] = clone(conta);
    return clone(conta);
  }

  async ajustarSaldo(id: string, deltaCents: number): Promise<void> {
    this.ajustes.push({ id, deltaCents });
    const i = this.itens.findIndex((c) => c.id === id);
    const alvo = this.itens[i];
    if (!alvo) throw new Error(`conta inexistente: ${id}`);
    this.itens[i] = { ...alvo, saldoCents: alvo.saldoCents + deltaCents };
  }

  saldoDe(id: string): number {
    const c = this.itens.find((x) => x.id === id);
    if (!c) throw new Error(`conta inexistente: ${id}`);
    return c.saldoCents;
  }
}

export class FakeCategoriaRepo implements CategoriaRepository {
  private seq = 0;
  constructor(public itens: Categoria[] = []) {}

  async listar(): Promise<Categoria[]> {
    return this.itens.map(clone);
  }

  async obter(id: string): Promise<Categoria | null> {
    const c = this.itens.find((x) => x.id === id);
    return c ? clone(c) : null;
  }

  /** Espelha `PrismaCategoriaRepository.salvar` — ver comentário em `FakeContaRepo.salvar`. */
  async salvar(categoria: Categoria): Promise<Categoria> {
    if (!categoria.id) {
      this.seq += 1;
      const criada: Categoria = { ...clone(categoria), id: `cat-${this.seq}` };
      this.itens.push(criada);
      return clone(criada);
    }
    const i = this.itens.findIndex((c) => c.id === categoria.id);
    if (i < 0) throw new Error(`categoria inexistente: ${categoria.id}`);
    this.itens[i] = clone(categoria);
    return clone(categoria);
  }
}

export class FakeCustoFixoRepo implements CustoFixoRepository {
  private seq = 0;
  constructor(public itens: CustoFixo[] = []) {}

  async listarAtivos(): Promise<CustoFixo[]> {
    return this.itens.filter((c) => c.ativo).map(clone);
  }

  async listarTodos(): Promise<CustoFixo[]> {
    return this.itens.map(clone);
  }

  async obter(id: string): Promise<CustoFixo | null> {
    const c = this.itens.find((x) => x.id === id);
    return c ? clone(c) : null;
  }

  /**
   * Espelha `PrismaCustoFixoRepository.salvar` — ver comentário em
   * `FakeContaRepo.salvar`. Sem isto, criar DOIS custos fixos novos (ambos
   * chegando com `id: ''`, como `custoSchema` em `actions/config.ts` monta)
   * fazia o segundo `findIndex` casar com o primeiro (id === '' === '') e
   * sobrescrevê-lo: dois custos criados viravam 1 item no fake e 2 linhas
   * reais no Postgres — teste verde, produção divergente.
   */
  async salvar(custo: CustoFixo): Promise<CustoFixo> {
    if (!custo.id) {
      this.seq += 1;
      const criado: CustoFixo = { ...clone(custo), id: `cf-${this.seq}` };
      this.itens.push(criado);
      return clone(criado);
    }
    const i = this.itens.findIndex((c) => c.id === custo.id);
    if (i < 0) throw new Error(`custo fixo inexistente: ${custo.id}`);
    this.itens[i] = clone(custo);
    return clone(custo);
  }

  /**
   * Reproduz a FK Restrict do schema: quem tem pagamento registrado não é
   * apagável. O fake não conhece `PagamentoFixo`, então o teste injeta os ids
   * bloqueados aqui — senão o caso de uso passaria no fake e quebraria no banco.
   * Lança a MESMA classe que o adapter Prisma real traduz do P2003, para o
   * caso de uso exercitar o mesmo caminho de backstop nos dois ambientes.
   */
  public bloqueadosPorPagamento = new Set<string>();

  async excluir(id: string): Promise<void> {
    if (this.bloqueadosPorPagamento.has(id)) {
      throw new RestricaoDeIntegridadeError('Custo fixo');
    }
    const i = this.itens.findIndex((c) => c.id === id);
    if (i < 0) throw new Error(`custo fixo inexistente: ${id}`);
    this.itens.splice(i, 1);
  }
}

/**
 * Fake do rastreamento de "custo fixo pago no ciclo". Reproduz a idempotência
 * da constraint única (custoFixoId, cicloId) do schema real: marcar duas
 * vezes o mesmo par nunca duplica, só atualiza `pagoEm`.
 */
export class FakePagamentoFixoRepo implements PagamentoFixoRepository {
  private seq = 0;
  constructor(public itens: PagamentoFixo[] = []) {}

  async listarPorCiclo(cicloId: string): Promise<PagamentoFixo[]> {
    return this.itens.filter((p) => p.cicloId === cicloId).map(clone);
  }

  async marcarPago(custoFixoId: string, cicloId: string, pagoEm: DataCivil): Promise<PagamentoFixo> {
    const i = this.itens.findIndex((p) => p.custoFixoId === custoFixoId && p.cicloId === cicloId);
    if (i >= 0) {
      const atualizado: PagamentoFixo = { ...em(this.itens, i), pagoEm };
      this.itens[i] = atualizado;
      return clone(atualizado);
    }
    this.seq += 1;
    const novo: PagamentoFixo = { id: `pgto-${this.seq}`, custoFixoId, cicloId, pagoEm };
    this.itens.push(novo);
    return clone(novo);
  }

  async desmarcarPago(custoFixoId: string, cicloId: string): Promise<void> {
    this.itens = this.itens.filter(
      (p) => !(p.custoFixoId === custoFixoId && p.cicloId === cicloId),
    );
  }

  async contarPorCustoFixo(custoFixoId: string): Promise<number> {
    return this.itens.filter((p) => p.custoFixoId === custoFixoId).length;
  }

  async contarPorCustoFixoAgrupado(): Promise<Record<string, number>> {
    const contagem: Record<string, number> = {};
    for (const p of this.itens) {
      contagem[p.custoFixoId] = (contagem[p.custoFixoId] ?? 0) + 1;
    }
    return contagem;
  }
}

export class FakeProvisaoRepo implements ProvisaoRepository {
  public ajustes: Array<{ id: string; deltaCents: number }> = [];
  private seq = 0;
  constructor(public itens: ProvisaoAnual[] = []) {}

  async listarAtivas(): Promise<ProvisaoAnual[]> {
    return this.itens.filter((p) => p.ativo).map(clone);
  }

  async listarTodas(): Promise<ProvisaoAnual[]> {
    return this.itens.map(clone);
  }

  async obter(id: string): Promise<ProvisaoAnual | null> {
    const p = this.itens.find((x) => x.id === id);
    return p ? clone(p) : null;
  }

  /** Espelha `PrismaProvisaoRepository.salvar` — ver comentário em `FakeCustoFixoRepo.salvar`. */
  async salvar(provisao: ProvisaoAnual): Promise<ProvisaoAnual> {
    if (!provisao.id) {
      this.seq += 1;
      const criada: ProvisaoAnual = { ...clone(provisao), id: `prov-${this.seq}` };
      this.itens.push(criada);
      return clone(criada);
    }
    const i = this.itens.findIndex((p) => p.id === provisao.id);
    if (i < 0) throw new Error(`provisão inexistente: ${provisao.id}`);
    this.itens[i] = clone(provisao);
    return clone(provisao);
  }

  /**
   * Reproduz a FK Restrict de `Transacao.provisaoId`: provisão com gasto
   * lançado não é apagável. Espelha `bloqueadosPorPagamento` de
   * `FakeCustoFixoRepo`, lançando a mesma classe que o adapter Prisma real
   * traduz do P2003.
   */
  public bloqueadosPorGasto = new Set<string>();

  async excluir(id: string): Promise<void> {
    if (this.bloqueadosPorGasto.has(id)) {
      throw new RestricaoDeIntegridadeError('Provisão');
    }
    const i = this.itens.findIndex((p) => p.id === id);
    if (i < 0) throw new Error(`provisão inexistente: ${id}`);
    this.itens.splice(i, 1);
  }

  async ajustarAcumulado(id: string, deltaCents: number): Promise<void> {
    this.ajustes.push({ id, deltaCents });
    const i = this.itens.findIndex((p) => p.id === id);
    const alvo = this.itens[i];
    if (!alvo) throw new Error(`provisão inexistente: ${id}`);
    this.itens[i] = { ...alvo, acumuladoCents: alvo.acumuladoCents + deltaCents };
  }

  acumuladoDe(id: string): number {
    const p = this.itens.find((x) => x.id === id);
    if (!p) throw new Error(`provisão inexistente: ${id}`);
    return p.acumuladoCents;
  }
}

export class FakeTransacaoRepo implements TransacaoRepository {
  private seq = 0;
  constructor(
    public itens: Transacao[] = [],
    /**
     * Repositórios auxiliares que `aplicarLote` precisa tocar dentro da mesma
     * "transação". Opcionais para não quebrar quem instancia o fake sozinho;
     * `criarDeps` sempre os liga.
     */
    private contas?: FakeContaRepo,
    private provisoes?: FakeProvisaoRepo,
  ) {}

  /**
   * Injeção de falha para testar ATOMICIDADE (§5.1 ticket 1). Quando definido,
   * `aplicarLote` lança depois de validar a entrada e ANTES de mutar qualquer
   * array — reproduzindo o rollback de um `$transaction` que aborta.
   */
  public falharNoLote: string | null = null;
  /** Quantas vezes `aplicarLote` foi chamado — prova que o caminho é um só. */
  public lotesAplicados = 0;

  ligarBuckets(contas: FakeContaRepo, provisoes: FakeProvisaoRepo): void {
    this.contas = contas;
    this.provisoes = provisoes;
  }

  /**
   * Espelha o `$transaction` do adapter Prisma: ou tudo acontece, ou nada.
   * Como o fake é síncrono depois do guard, uma falha injetada não deixa
   * estado pela metade — que é exatamente a garantia que o teste precisa
   * provar (saldo creditado de parcela que continuaria viva).
   */
  async aplicarLote(lote: {
    excluir?: readonly string[];
    criar?: readonly Transacao[];
    ajustesConta?: readonly { contaId: string; deltaCents: number }[];
    ajustesProvisao?: readonly { provisaoId: string; deltaCents: number }[];
  }): Promise<Transacao[]> {
    this.lotesAplicados += 1;
    if (this.falharNoLote) throw new Error(this.falharNoLote);

    const aExcluir = new Set(lote.excluir ?? []);
    this.itens = this.itens.filter((t) => !aExcluir.has(t.id));

    const criadas: Transacao[] = [];
    for (const t of lote.criar ?? []) {
      this.seq += 1;
      const nova: Transacao = { ...clone(t), id: `tx-${this.seq}` };
      this.itens.push(nova);
      criadas.push(clone(nova));
    }

    for (const a of lote.ajustesConta ?? []) {
      if (a.deltaCents !== 0) await this.contas?.ajustarSaldo(a.contaId, a.deltaCents);
    }
    for (const a of lote.ajustesProvisao ?? []) {
      if (a.deltaCents !== 0) await this.provisoes?.ajustarAcumulado(a.provisaoId, a.deltaCents);
    }

    return criadas;
  }

  async obter(id: string): Promise<Transacao | null> {
    const t = this.itens.find((x) => x.id === id);
    return t ? clone(t) : null;
  }

  async listarPorCiclo(cicloId: string): Promise<Transacao[]> {
    return this.itens.filter((t) => t.cicloId === cicloId).map(clone);
  }

  async listarPorIntervalo(inicio: DataCivil, fim: DataCivil): Promise<Transacao[]> {
    return this.itens.filter((t) => t.data >= inicio && t.data <= fim).map(clone);
  }

  async listarPorParcelamento(parcelamentoId: string): Promise<Transacao[]> {
    return this.itens
      .filter((t) => t.parcelamentoId === parcelamentoId)
      .sort((a, b) => a.data.localeCompare(b.data) || (a.parcelaNum ?? 0) - (b.parcelaNum ?? 0))
      .map(clone);
  }

  async listarPorItensImportados(itemImportadoIds: readonly string[]): Promise<Transacao[]> {
    const conjunto = new Set(itemImportadoIds);
    return this.itens.filter((t) => t.itemImportadoId && conjunto.has(t.itemImportadoId)).map(clone);
  }

  /**
   * Espelha `dadosTransacao` do adapter Prisma (I3): `origem`/`itemImportadoId`
   * são opcionais na entidade, e quem grava default para `'MANUAL'`/`null` —
   * senão o fake devolveria `undefined` onde o banco real nunca devolveria.
   */
  async criar(transacao: Transacao): Promise<Transacao> {
    this.seq += 1;
    if (
      transacao.itemImportadoId &&
      this.itens.some((t) => t.itemImportadoId === transacao.itemImportadoId)
    ) {
      throw new ItemImportadoJaGravadoError(transacao.itemImportadoId);
    }
    const nova: Transacao = {
      ...clone(transacao),
      id: `tx-${this.seq}`,
      origem: transacao.origem ?? 'MANUAL',
      itemImportadoId: transacao.itemImportadoId ?? null,
    };
    this.itens.push(nova);
    return clone(nova);
  }

  async criarVarias(transacoes: readonly Transacao[]): Promise<Transacao[]> {
    const criadas: Transacao[] = [];
    for (const t of transacoes) criadas.push(await this.criar(t));
    return criadas;
  }

  async atualizar(id: string, patch: Partial<Transacao>): Promise<Transacao> {
    const i = this.itens.findIndex((t) => t.id === id);
    const alvo = this.itens[i];
    if (!alvo) throw new Error(`transação inexistente: ${id}`);
    const atualizada: Transacao = { ...alvo, ...clone(patch) };
    this.itens[i] = atualizada;
    return clone(atualizada);
  }

  async excluir(id: string): Promise<void> {
    this.itens = this.itens.filter((t) => t.id !== id);
  }

  async vincularCicloPorData(cicloId: string, inicio: DataCivil, fim: DataCivil): Promise<number> {
    let n = 0;
    this.itens = this.itens.map((t) => {
      if (t.cicloId == null && t.data >= inicio && t.data <= fim) {
        n += 1;
        return { ...t, cicloId };
      }
      return t;
    });
    return n;
  }

  async marcarPaga(transacaoId: string, pagoEm: DataCivil | null): Promise<Transacao> {
    const i = this.itens.findIndex((t) => t.id === transacaoId);
    const alvo = this.itens[i];
    if (!alvo) throw new Error(`transação inexistente: ${transacaoId}`);
    const atualizada: Transacao = { ...alvo, pagoEm };
    this.itens[i] = atualizada;
    return clone(atualizada);
  }
}

export class FakeParcelamentoRepo implements ParcelamentoRepository {
  private seq = 0;
  constructor(public itens: Parcelamento[] = []) {}

  /** Espelha `PrismaParcelamentoRepository.criar`: `parcelaInicial` default `1`. */
  async criar(parcelamento: Parcelamento): Promise<Parcelamento> {
    this.seq += 1;
    const novo: Parcelamento = {
      ...clone(parcelamento),
      id: `parc-${this.seq}`,
      parcelaInicial: parcelamento.parcelaInicial ?? 1,
    };
    this.itens.push(novo);
    return clone(novo);
  }

  async listarPorIds(ids: readonly string[]): Promise<Parcelamento[]> {
    const conjunto = new Set(ids);
    return this.itens.filter((p) => conjunto.has(p.id)).map(clone);
  }

  async listar(): Promise<Parcelamento[]> {
    return [...this.itens].sort((a, b) => b.dataCompra.localeCompare(a.dataCompra)).map(clone);
  }

  async obter(id: string): Promise<Parcelamento | null> {
    const p = this.itens.find((x) => x.id === id);
    return p ? clone(p) : null;
  }

  async atualizar(id: string, patch: Partial<Parcelamento>): Promise<Parcelamento> {
    const i = this.itens.findIndex((p) => p.id === id);
    const alvo = this.itens[i];
    if (!alvo) throw new Error(`parcelamento inexistente: ${id}`);
    // Espelha o adapter Prisma: `id` nunca é paciente de patch.
    const { id: _id, ...dados } = clone(patch);
    const atualizado: Parcelamento = { ...alvo, ...dados };
    this.itens[i] = atualizado;
    return clone(atualizado);
  }

  async excluir(id: string): Promise<void> {
    const antes = this.itens.length;
    this.itens = this.itens.filter((p) => p.id !== id);
    if (this.itens.length === antes) throw new Error(`parcelamento inexistente: ${id}`);
  }
}

export class FakePatrimonioRepo implements PatrimonioRepository {
  private seq = 0;
  constructor(public itens: SnapshotPatrimonio[] = []) {}

  private cronologicoDesc(): SnapshotPatrimonio[] {
    return [...this.itens].sort((a, b) => b.data.localeCompare(a.data));
  }

  async ultimoSnapshot(): Promise<SnapshotPatrimonio | null> {
    const s = this.cronologicoDesc()[0];
    return s ? clone(s) : null;
  }

  async ultimosSnapshots(n: number): Promise<SnapshotPatrimonio[]> {
    return this.cronologicoDesc().slice(0, n).map(clone);
  }

  async salvar(snapshot: SnapshotPatrimonio): Promise<SnapshotPatrimonio> {
    // Espelha o adapter: um snapshot por data, o novo substitui o da mesma data.
    this.itens = this.itens.filter((s) => s.data !== snapshot.data);
    this.seq += 1;
    const novo: SnapshotPatrimonio = { ...clone(snapshot), id: `snap-${this.seq}` };
    this.itens.push(novo);
    return clone(novo);
  }
}

// ── Fakes de identidade e segurança (plano TASKS-AUTH) ──────────────────────

export const ATOR_OWNER: Ator = { id: 'u-owner', papel: 'OWNER' };
export const ATOR_VIEWER: Ator = { id: 'u-viewer', papel: 'VIEWER' };

export class FakeUsuarioRepo implements UsuarioRepository {
  criados: NovoUsuario[] = [];
  private proximoId = 1;

  constructor(private readonly usuarios: Usuario[] = []) {}

  async porEmail(email: string): Promise<Usuario | null> {
    return clone(this.usuarios.find((u) => u.email === email.trim().toLowerCase()) ?? null);
  }

  async porId(id: string): Promise<Usuario | null> {
    return clone(this.usuarios.find((u) => u.id === id) ?? null);
  }

  async criar(dados: NovoUsuario): Promise<Usuario> {
    const email = dados.email.trim().toLowerCase();
    // Imita a constraint unique do banco — é assim que o caso de uso descobre
    // que o email já existe.
    if (this.usuarios.some((u) => u.email === email)) throw new EmailJaUsadoError();

    this.criados.push(dados);
    const novo: Usuario = {
      id: `u-novo-${this.proximoId++}`,
      email,
      nome: dados.nome,
      senhaHash: dados.senhaHash,
      papel: dados.papel,
      ativo: true,
    };
    this.usuarios.push(novo);
    return clone(novo);
  }
}

/** Sessão em memória: registra as chamadas para os testes asserirem. */
export class FakeSessaoPort implements SessaoPort {
  criadas: string[] = [];
  invalidacoes = 0;
  constructor(private atorAtual: Ator | null = null) {}

  async criar(usuarioId: string): Promise<{ expiraEm: Date }> {
    this.criadas.push(usuarioId);
    return { expiraEm: new Date('2026-09-03T00:00:00Z') };
  }

  async validar(): Promise<Ator | null> {
    return this.atorAtual;
  }

  async invalidar(): Promise<void> {
    this.invalidacoes += 1;
    this.atorAtual = null;
  }
}

/**
 * Hash fake determinístico. `verificar` conta as chamadas para o teste provar
 * que a senha é conferida mesmo quando o usuário não existe (defesa de timing).
 *
 * Usa base64 e NÃO concatena a senha em claro de propósito: com `hash(${'${senha}'})`
 * o resultado conteria a senha como substring, e um teste que verifica
 * "o hash não vaza a senha" passaria por acidente contra o hasher real e
 * falharia contra o fake — ou pior, o contrário. Isto não é criptografia; é só
 * uma transformação que não devolve a senha literal.
 */
export class FakeHashSenha implements HashSenhaPort {
  verificacoes = 0;

  async hashear(senha: string): Promise<string> {
    return `fake$${Buffer.from(senha, 'utf8').toString('base64')}`;
  }

  async verificar(senha: string, hash: string): Promise<boolean> {
    this.verificacoes += 1;
    return hash === (await this.hashear(senha));
  }
}

/** Limiter determinístico: nega a partir da N-ésima chamada por chave. */
export class FakeRateLimiter implements RateLimiterPort {
  private contagens = new Map<string, number>();
  chamadas: string[] = [];

  async permitir(chave: string, limite: number): Promise<boolean> {
    this.chamadas.push(chave);
    const usada = (this.contagens.get(chave) ?? 0) + 1;
    this.contagens.set(chave, usada);
    return usada <= limite;
  }
}

export interface FakeDeps extends Deps {
  relogio: RelogioPort;
  config: FakeConfigRepo;
  contas: FakeContaRepo;
  categorias: FakeCategoriaRepo;
  custosFixos: FakeCustoFixoRepo;
  pagamentosFixos: FakePagamentoFixoRepo;
  provisoes: FakeProvisaoRepo;
  transacoes: FakeTransacaoRepo;
  parcelamentos: FakeParcelamentoRepo;
  ciclos: FakeCicloRepo;
  patrimonio: FakePatrimonioRepo;
  usuarios: FakeUsuarioRepo;
  sessoes: FakeSessaoPort;
  hashSenha: FakeHashSenha;
  rateLimiter: FakeRateLimiter;
  /** Concreto (não opcional) para os testes poderem asserir os incrementos. */
  usoIA: FakeUsoIARepo;
  /** Concreto para os testes poderem inspecionar o que foi guardado. */
  memorias: FakeMemoriaRepo;
  /** Concreto para os testes poderem inspecionar conversas/mensagens gravadas. */
  conversas: FakeConversaRepo;
  /** Concreto para os testes poderem inspecionar rascunhos de importação gravados. */
  importacoes: FakeImportacaoRepo;
}

export const CONFIG_PADRAO: Config = {
  id: 1,
  rendaBaseCents: 800_000, // R$ 8.000,00
  rendaVariavel: false,
  diaRecebimento: 5,
  metaPoupancaCents: 100_000, // R$ 1.000,00
  metaPoupancaPercent: null,
  moeda: 'BRL',
  timezone: 'America/Bahia',
  destinoSobra: 'RESERVA',
  destinoSobraContaId: null,
  pisoDiarioVerbaCents: 1500,
};

/** Categoria VARIAVEL padrão — só o que é VARIAVEL consome verba. */
export const CATEGORIA_VARIAVEL: Categoria = {
  id: 'cat-var',
  nome: 'Mercado',
  grupo: 'VARIAVEL',
  essencial: true,
  icone: null,
  cor: null,
  ordem: 1,
};

export const CATEGORIA_FIXA: Categoria = {
  id: 'cat-fixo',
  nome: 'Aluguel',
  grupo: 'FIXO',
  essencial: true,
  icone: null,
  cor: null,
  ordem: 2,
};

export interface OpcoesFakeDeps {
  hoje?: DataCivil;
  relogio?: RelogioPort;
  config?: Config | null;
  contas?: Conta[];
  categorias?: Categoria[];
  custosFixos?: CustoFixo[];
  provisoes?: ProvisaoAnual[];
  transacoes?: Transacao[];
  ciclos?: Ciclo[];
  snapshots?: SnapshotPatrimonio[];
  pagamentosFixos?: PagamentoFixo[];
  /**
   * Ator da requisição. Default OWNER para que os testes existentes (que
   * exercitam regra financeira, não permissão) sigam valendo sem mudança. Os
   * testes de autorização passam VIEWER explicitamente.
   */
  ator?: Ator;
  usuarios?: Usuario[];
  sessaoAtual?: Ator | null;
  /**
   * Cadastros de parcelamento já existentes. Antes era o único repositório
   * sem semente em `OpcoesFakeDeps` (§5.1 ticket 0) e os testes contornavam
   * com `deps.parcelamentos.itens.push(...)`.
   */
  parcelamentos?: Parcelamento[];
  /** Uso de IA já acumulado no dia, para testar o teto de custo. */
  usoIA?: UsoIADia;
  /** Memórias já existentes (Fase E). */
  memorias?: Memoria[];
  /** Sem isto não há embedding, e a busca degrada para "mais recentes". */
  embeddings?: EmbeddingPort;
}

/**
 * Contador de uso da IA em memória. Registra o que foi incrementado para o
 * teste poder asserir que os tokens gastos foram contabilizados.
 */
export class FakeUsoIARepo implements UsoIARepository {
  public incrementos: { dia: DataCivil; uso: UsoIADia }[] = [];
  private readonly porDia = new Map<DataCivil, UsoIADia>();

  constructor(inicial?: { dia: DataCivil; uso: UsoIADia }) {
    if (inicial) this.porDia.set(inicial.dia, { ...inicial.uso });
  }

  async doDia(dia: DataCivil): Promise<UsoIADia> {
    return { ...(this.porDia.get(dia) ?? { requisicoes: 0, tokensEntrada: 0, tokensSaida: 0 }) };
  }

  async incrementar(dia: DataCivil, uso: UsoIADia): Promise<void> {
    this.incrementos.push({ dia, uso: { ...uso } });
    const atual = await this.doDia(dia);
    this.porDia.set(dia, {
      requisicoes: atual.requisicoes + uso.requisicoes,
      tokensEntrada: atual.tokensEntrada + uso.tokensEntrada,
      tokensSaida: atual.tokensSaida + uso.tokensSaida,
    });
  }
}

/**
 * Memória em memória (Fase E). Guarda o vetor recebido para o teste poder
 * asserir que o embedding chegou — e ordena a "busca semântica" por distância
 * euclidiana simples, o suficiente para provar que o caso de uso usa a ordem
 * que o adapter devolve, sem simular pgvector.
 */
export class FakeMemoriaRepo implements MemoriaPort {
  public itens: (Memoria & { embedding: readonly number[] | null })[] = [];
  public arquivadas: string[] = [];
  private proximoId = 1;

  constructor(iniciais: Memoria[] = []) {
    this.itens = iniciais.map((m) => ({ ...m, embedding: null }));
  }

  async criar(nova: NovaMemoria): Promise<Memoria> {
    const criada: Memoria = {
      id: `mem-${this.proximoId++}`,
      tipo: nova.tipo,
      texto: nova.texto,
      origem: nova.origem,
      ativo: true,
      criadoEm: new Date('2026-08-04T12:00:00Z'),
    };
    this.itens.push({ ...criada, embedding: nova.embedding });
    return criada;
  }

  async listar(opcoes?: {
    tipos?: readonly TipoMemoria[];
    incluirArquivadas?: boolean;
    limite?: number;
  }): Promise<Memoria[]> {
    return this.itens
      .filter((m) => (opcoes?.incluirArquivadas ? true : m.ativo))
      .filter((m) => (opcoes?.tipos?.length ? opcoes.tipos.includes(m.tipo) : true))
      .slice(0, opcoes?.limite ?? undefined)
      .map(({ embedding: _embedding, ...m }) => m);
  }

  async obter(id: string): Promise<Memoria | null> {
    const achada = this.itens.find((m) => m.id === id);
    if (!achada) return null;
    const { embedding: _embedding, ...m } = achada;
    return m;
  }

  async buscarPorEmbedding(
    embedding: readonly number[],
    opcoes?: { limite?: number; tipos?: readonly TipoMemoria[] },
  ): Promise<MemoriaComRelevancia[]> {
    const distancia = (v: readonly number[]): number =>
      Math.sqrt(v.reduce((s, x, i) => s + (x - (embedding[i] ?? 0)) ** 2, 0));

    return this.itens
      .filter((m) => m.ativo && m.embedding !== null)
      .filter((m) => (opcoes?.tipos?.length ? opcoes.tipos.includes(m.tipo) : true))
      .map(({ embedding: vetor, ...m }) => ({ ...m, distancia: distancia(vetor ?? []) }))
      .sort((a, b) => a.distancia - b.distancia)
      .slice(0, opcoes?.limite ?? 5);
  }

  async listarSemEmbedding(limite = 100): Promise<Memoria[]> {
    return this.itens
      .filter((m) => m.ativo && m.embedding === null)
      .slice(0, limite)
      .map(({ embedding: _embedding, ...m }) => m);
  }

  async definirEmbedding(id: string, embedding: readonly number[]): Promise<void> {
    const achada = this.itens.find((m) => m.id === id);
    if (achada) achada.embedding = embedding;
  }

  async arquivar(id: string): Promise<void> {
    this.arquivadas.push(id);
    const achada = this.itens.find((m) => m.id === id);
    if (achada) achada.ativo = false;
  }

  async reativar(id: string): Promise<void> {
    const achada = this.itens.find((m) => m.id === id);
    if (achada) achada.ativo = true;
  }

  async excluirTodas(): Promise<void> {
    this.itens = [];
  }
}

/**
 * Conversas do copiloto em memória (Fase 1 da persistência). `anexarTurno`
 * espelha a garantia do adapter real: as duas mensagens são empurradas juntas
 * e `atualizadaEm` é bumpado, ou nada é gravado — um `conversaId` que não
 * existe nesta lista lança, do mesmo jeito que o `updateMany` do Prisma afeta
 * zero linhas e a transação real aborta.
 */
export class FakeConversaRepo implements ConversaPort {
  public conversas: Conversa[] = [];
  public mensagens: MensagemConversa[] = [];
  private proximoId = 1;

  async criar(titulo: string): Promise<Conversa> {
    const agora = new Date('2026-08-11T12:00:00Z');
    const conversa: Conversa = {
      id: `conversa-${this.proximoId++}`,
      titulo: titulo.trim() || 'Nova conversa',
      criadaEm: agora,
      atualizadaEm: agora,
    };
    this.conversas.push(conversa);
    return clone(conversa);
  }

  async listar(): Promise<Conversa[]> {
    return clone(
      [...this.conversas].sort((a, b) => b.atualizadaEm.getTime() - a.atualizadaEm.getTime()),
    );
  }

  async obterComMensagens(id: string): Promise<ConversaComMensagens | null> {
    const conversa = this.conversas.find((c) => c.id === id);
    if (!conversa) return null;
    const mensagens = this.mensagens
      .filter((m) => m.conversaId === id)
      .sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime());
    return clone({ conversa, mensagens });
  }

  async anexarTurno(conversaId: string, turno: NovoTurno): Promise<void> {
    const conversa = this.conversas.find((c) => c.id === conversaId);
    if (!conversa) throw new Error(`Conversa ${conversaId} não encontrada.`);

    const agora = new Date();
    conversa.atualizadaEm = agora;

    this.mensagens.push(
      {
        id: `msg-${this.proximoId++}`,
        conversaId,
        papel: 'usuario',
        conteudo: turno.pergunta,
        proveniencia: null,
        criadaEm: agora,
      },
      {
        id: `msg-${this.proximoId++}`,
        conversaId,
        papel: 'assistente',
        conteudo: turno.resposta,
        proveniencia: turno.proveniencia,
        criadaEm: agora,
      },
    );
  }

  async ultimasMensagens(conversaId: string, limite: number): Promise<MensagemConversa[]> {
    const daConversa = this.mensagens
      .filter((m) => m.conversaId === conversaId)
      .sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime());
    return clone(daConversa.slice(Math.max(0, daConversa.length - limite)));
  }

  async renomear(id: string, titulo: string): Promise<void> {
    const conversa = this.conversas.find((c) => c.id === id);
    if (conversa) conversa.titulo = titulo.trim() || 'Nova conversa';
  }

  async excluir(id: string): Promise<void> {
    this.conversas = this.conversas.filter((c) => c.id !== id);
    this.mensagens = this.mensagens.filter((m) => m.conversaId !== id);
  }
}

/**
 * Rascunhos de importação de fatura em memória (I3). Espelha as garantias do
 * adapter real: `criarRascunho` grava cabeçalho + itens de uma vez,
 * `registrarDecisao`/`marcarConfirmada`/`marcarDescartada` lançam quando o id
 * não existe — mesmo comportamento de `updateMany` afetando zero linhas no
 * Prisma real, só que aqui num único dono (os fakes deste arquivo não
 * simulam multi-tenant, como `FakeConversaRepo`).
 */
export class FakeImportacaoRepo implements ImportacaoRepository {
  public importacoes: Importacao[] = [];
  public itens: ItemImportado[] = [];
  private proximoId = 1;

  private comItens(importacao: Importacao): ImportacaoComItens {
    return clone({
      importacao,
      itens: this.itens
        .filter((i) => i.importacaoId === importacao.id)
        .sort((a, b) => a.ordem - b.ordem),
    });
  }

  async criarRascunho(dados: NovaImportacao): Promise<ImportacaoComItens> {
    const importacao: Importacao = {
      id: `importacao-${this.proximoId++}`,
      origem: dados.origem,
      nomeArquivo: dados.nomeArquivo,
      hashConteudo: dados.hashConteudo,
      competenciaRef: dados.competenciaRef,
      status: 'RASCUNHO',
      tokensEntrada: dados.tokensEntrada,
      tokensSaida: dados.tokensSaida,
      criadaEm: new Date('2026-08-25T12:00:00Z'),
      confirmadaEm: null,
    };
    this.importacoes.push(importacao);
    for (const item of dados.itens) {
      this.itens.push({
        id: `item-importado-${this.proximoId++}`,
        importacaoId: importacao.id,
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
        decisao: 'PENDENTE',
        chaveDedup: item.chaveDedup,
      });
    }
    return this.comItens(importacao);
  }

  async obterPorHash(hashConteudo: string): Promise<ImportacaoComItens | null> {
    const achada = this.importacoes.find((i) => i.hashConteudo === hashConteudo);
    return achada ? this.comItens(achada) : null;
  }

  async obter(id: string): Promise<ImportacaoComItens | null> {
    const achada = this.importacoes.find((i) => i.id === id);
    return achada ? this.comItens(achada) : null;
  }

  async listar(limite = 20): Promise<Importacao[]> {
    return clone(
      [...this.importacoes]
        .sort((a, b) => b.criadaEm.getTime() - a.criadaEm.getTime())
        .slice(0, limite),
    );
  }

  async registrarDecisao(itemId: string, decisao: DecisaoRegistravel): Promise<void> {
    const item = this.itens.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item de importação ${itemId} não encontrado.`);
    item.decisao = decisao;
  }

  async marcarConfirmada(id: string): Promise<void> {
    const importacao = this.importacoes.find((i) => i.id === id);
    if (!importacao) throw new Error(`Importação ${id} não encontrada.`);
    importacao.status = 'CONFIRMADA';
    importacao.confirmadaEm = new Date('2026-08-25T12:00:00Z');
  }

  async marcarDescartada(id: string): Promise<void> {
    const importacao = this.importacoes.find((i) => i.id === id);
    if (!importacao) throw new Error(`Importação ${id} não encontrada.`);
    importacao.status = 'DESCARTADA';
  }

  async reabrirItem(itemId: string): Promise<void> {
    const item = this.itens.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item de importação ${itemId} não encontrado.`);
    item.decisao = 'PENDENTE';
  }
}

/**
 * Embedding determinístico e sem rede: o vetor é o histograma dos códigos de
 * caractere. Textos parecidos ficam perto, o que basta para testar ordenação
 * sem depender de provedor.
 */
export class FakeEmbedding implements EmbeddingPort {
  readonly dimensoes = 8;
  public chamadas: string[] = [];
  public falhar = false;

  async gerar(texto: string): Promise<ResultadoEmbedding> {
    this.chamadas.push(texto);
    if (this.falhar) {
      throw new ErroProvedorIA('INDISPONIVEL', 'falha programada no fake de embedding');
    }
    const vetor: number[] = Array.from({ length: this.dimensoes }, () => 0);
    for (const char of texto) {
      const posicao = char.charCodeAt(0) % this.dimensoes;
      vetor[posicao] = (vetor[posicao] ?? 0) + 1;
    }
    return { vetor, consumo: { entrada: texto.length, saida: 0 } };
  }
}

export function criarDeps(opcoes: OpcoesFakeDeps = {}): FakeDeps {
  const config = opcoes.config === undefined ? clone(CONFIG_PADRAO) : opcoes.config;
  // `aplicarLote` mexe em saldo de conta e acumulado de provisão dentro da
  // mesma "transação", então o fake de transações precisa enxergar os outros
  // dois — do mesmo jeito que o adapter Prisma enxerga as três tabelas.
  const contas = new FakeContaRepo(opcoes.contas ?? []);
  const provisoes = new FakeProvisaoRepo(opcoes.provisoes ?? []);
  const transacoes = new FakeTransacaoRepo(opcoes.transacoes ?? [], contas, provisoes);
  return {
    ator: opcoes.ator ?? ATOR_OWNER,
    usuarios: new FakeUsuarioRepo(opcoes.usuarios ?? []),
    sessoes: new FakeSessaoPort(opcoes.sessaoAtual ?? null),
    hashSenha: new FakeHashSenha(),
    rateLimiter: new FakeRateLimiter(),
    relogio: opcoes.relogio ?? new RelogioFixo(opcoes.hoje ?? '2026-07-20'),
    config: new FakeConfigRepo(config),
    contas,
    categorias: new FakeCategoriaRepo(opcoes.categorias ?? [CATEGORIA_VARIAVEL, CATEGORIA_FIXA]),
    custosFixos: new FakeCustoFixoRepo(opcoes.custosFixos ?? []),
    pagamentosFixos: new FakePagamentoFixoRepo(opcoes.pagamentosFixos ?? []),
    provisoes,
    transacoes,
    parcelamentos: new FakeParcelamentoRepo(opcoes.parcelamentos ?? []),
    ciclos: new FakeCicloRepo(opcoes.ciclos ?? []),
    patrimonio: new FakePatrimonioRepo(opcoes.snapshots ?? []),
    usoIA: new FakeUsoIARepo(
      opcoes.usoIA ? { dia: opcoes.hoje ?? '2026-07-20', uso: opcoes.usoIA } : undefined,
    ),
    memorias: new FakeMemoriaRepo(opcoes.memorias ?? []),
    // `undefined` por padrão: a maioria dos testes não deve pagar embedding.
    // Quem testa busca semântica passa `embeddings: new FakeEmbedding()`.
    embeddings: opcoes.embeddings,
    conversas: new FakeConversaRepo(),
    importacoes: new FakeImportacaoRepo(),
  };
}

/** Ciclo completo com defaults sensatos; sobrescreva só o que o teste precisa. */
export function cicloFake(patch: Partial<Ciclo> = {}): Ciclo {
  return {
    id: 'ciclo-x',
    dataInicio: '2026-07-05',
    dataFim: '2026-08-04',
    rendaPrevistaCents: 800_000,
    rendaRealizadaCents: null,
    poupancaAlvoCents: 100_000,
    fixosCents: 0,
    provisaoMensalCents: 0,
    verbaVariavelCents: 700_000,
    rolloverRecebidoCents: 0,
    puxadoDaReservaForaDaRendaCents: 0,
    fechado: false,
    fechadoEm: null,
    sobraCents: null,
    observacao: null,
    ...patch,
  };
}

/** Transação completa com defaults; DESPESA VARIAVEL por padrão. */
export function transacaoFake(patch: Partial<Transacao> = {}): Transacao {
  return {
    id: 'tx-x',
    data: '2026-07-10',
    valorCents: 10_000,
    tipo: 'DESPESA',
    descricao: null,
    metodo: null,
    categoriaId: CATEGORIA_VARIAVEL.id,
    contaId: null,
    contaDestinoId: null,
    provisaoId: null,
    parcelamentoId: null,
    parcelaNum: null,
    estornoDeId: null,
    cicloId: 'ciclo-x',
    pagoEm: null,
    origem: 'MANUAL',
    itemImportadoId: null,
    ...patch,
  };
}

export function contaFake(patch: Partial<Conta> = {}): Conta {
  return {
    id: 'conta-x',
    nome: 'Reserva',
    tipo: 'RESERVA',
    saldoCents: 0,
    incluiPatrimonio: true,
    arquivada: false,
    ...patch,
  };
}

export function provisaoFake(patch: Partial<ProvisaoAnual> = {}): ProvisaoAnual {
  return {
    id: 'prov-x',
    nome: 'IPVA',
    valorAnualCents: 120_000,
    mesEsperado: 1,
    acumuladoCents: 0,
    ativo: true,
    ...patch,
  };
}
