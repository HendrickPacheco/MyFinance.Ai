/**
 * Fakes em memória das portas de `src/domain/ports/repositorios.ts`.
 *
 * Usados por `ciclos.test.ts` e `fechamento.test.ts`. NUNCA tocam o banco
 * real (`./data/app.db`) — tudo vive em arrays. Dinheiro é sempre Int em
 * centavos; data civil é sempre string "YYYY-MM-DD".
 */
import type { RelogioPort } from '@/domain/ports/relogio';
import type {
  ConfigRepository,
  ContaRepository,
  CategoriaRepository,
  CustoFixoRepository,
  PagamentoFixoRepository,
  ProvisaoRepository,
  TransacaoRepository,
  ParcelamentoRepository,
  CicloRepository,
  PatrimonioRepository,
} from '@/domain/ports/repositorios';
import type {
  Categoria,
  Ciclo,
  Config,
  Conta,
  CustoFixo,
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
import type { Usuario } from '@/domain/auth/usuario';
import type { SessaoPort } from '@/domain/ports/sessao';
import type { HashSenhaPort } from '@/domain/ports/hash-senha';
import type { RateLimiterPort } from '@/domain/ports/rate-limiter';
import { EmailJaUsadoError, type NovoUsuario, type UsuarioRepository } from '@/domain/ports/usuarios';

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
  constructor(public itens: Conta[] = []) {}

  async listar(opcoes?: { incluirArquivadas?: boolean }): Promise<Conta[]> {
    const inclui = opcoes?.incluirArquivadas ?? false;
    return this.itens.filter((c) => inclui || !c.arquivada).map(clone);
  }

  async obter(id: string): Promise<Conta | null> {
    const c = this.itens.find((x) => x.id === id);
    return c ? clone(c) : null;
  }

  async salvar(conta: Conta): Promise<Conta> {
    const i = this.itens.findIndex((c) => c.id === conta.id);
    if (i < 0) this.itens.push(clone(conta));
    else this.itens[i] = clone(conta);
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
  constructor(public itens: Categoria[] = []) {}

  async listar(): Promise<Categoria[]> {
    return this.itens.map(clone);
  }

  async obter(id: string): Promise<Categoria | null> {
    const c = this.itens.find((x) => x.id === id);
    return c ? clone(c) : null;
  }

  async salvar(categoria: Categoria): Promise<Categoria> {
    this.itens.push(clone(categoria));
    return clone(categoria);
  }
}

export class FakeCustoFixoRepo implements CustoFixoRepository {
  constructor(public itens: CustoFixo[] = []) {}

  async listarAtivos(): Promise<CustoFixo[]> {
    return this.itens.filter((c) => c.ativo).map(clone);
  }

  async salvar(custo: CustoFixo): Promise<CustoFixo> {
    this.itens.push(clone(custo));
    return clone(custo);
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
}

export class FakeProvisaoRepo implements ProvisaoRepository {
  public ajustes: Array<{ id: string; deltaCents: number }> = [];
  constructor(public itens: ProvisaoAnual[] = []) {}

  async listarAtivas(): Promise<ProvisaoAnual[]> {
    return this.itens.filter((p) => p.ativo).map(clone);
  }

  async salvar(provisao: ProvisaoAnual): Promise<ProvisaoAnual> {
    this.itens.push(clone(provisao));
    return clone(provisao);
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
  constructor(public itens: Transacao[] = []) {}

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

  async criar(transacao: Transacao): Promise<Transacao> {
    this.seq += 1;
    const nova: Transacao = { ...clone(transacao), id: `tx-${this.seq}` };
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

  async criar(parcelamento: Parcelamento): Promise<Parcelamento> {
    this.seq += 1;
    const novo: Parcelamento = { ...clone(parcelamento), id: `parc-${this.seq}` };
    this.itens.push(novo);
    return clone(novo);
  }

  async listarPorIds(ids: readonly string[]): Promise<Parcelamento[]> {
    const conjunto = new Set(ids);
    return this.itens.filter((p) => conjunto.has(p.id)).map(clone);
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

  async criar(snapshot: SnapshotPatrimonio): Promise<SnapshotPatrimonio> {
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
}

export function criarDeps(opcoes: OpcoesFakeDeps = {}): FakeDeps {
  const config = opcoes.config === undefined ? clone(CONFIG_PADRAO) : opcoes.config;
  return {
    ator: opcoes.ator ?? ATOR_OWNER,
    usuarios: new FakeUsuarioRepo(opcoes.usuarios ?? []),
    sessoes: new FakeSessaoPort(opcoes.sessaoAtual ?? null),
    hashSenha: new FakeHashSenha(),
    rateLimiter: new FakeRateLimiter(),
    relogio: opcoes.relogio ?? new RelogioFixo(opcoes.hoje ?? '2026-07-20'),
    config: new FakeConfigRepo(config),
    contas: new FakeContaRepo(opcoes.contas ?? []),
    categorias: new FakeCategoriaRepo(opcoes.categorias ?? [CATEGORIA_VARIAVEL, CATEGORIA_FIXA]),
    custosFixos: new FakeCustoFixoRepo(opcoes.custosFixos ?? []),
    pagamentosFixos: new FakePagamentoFixoRepo(opcoes.pagamentosFixos ?? []),
    provisoes: new FakeProvisaoRepo(opcoes.provisoes ?? []),
    transacoes: new FakeTransacaoRepo(opcoes.transacoes ?? []),
    parcelamentos: new FakeParcelamentoRepo(),
    ciclos: new FakeCicloRepo(opcoes.ciclos ?? []),
    patrimonio: new FakePatrimonioRepo(opcoes.snapshots ?? []),
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
