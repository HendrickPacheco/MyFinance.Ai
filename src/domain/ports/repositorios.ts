/**
 * Portas de persistência (repositories) da arquitetura hexagonal. O domínio e
 * os casos de uso dependem SÓ destas interfaces; os adapters concretos
 * (Prisma) vivem em src/infrastructure e são implementados a partir da Fase 2.
 *
 * Definidas já na Fase 1 para fixar a fronteira: nenhum caso de uso vai
 * conhecer Prisma, e o motor de cálculo continua recebendo dados puros.
 */
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
import type { DataCivil } from '@/shared/data';

export interface ConfigRepository {
  obter(): Promise<Config | null>;
  salvar(config: Config): Promise<Config>;
}

export interface ContaRepository {
  listar(opcoes?: { incluirArquivadas?: boolean }): Promise<Conta[]>;
  obter(id: string): Promise<Conta | null>;
  salvar(conta: Conta): Promise<Conta>;
  ajustarSaldo(id: string, deltaCents: number): Promise<void>;
}

export interface CategoriaRepository {
  listar(): Promise<Categoria[]>;
  obter(id: string): Promise<Categoria | null>;
  salvar(categoria: Categoria): Promise<Categoria>;
}

export interface CustoFixoRepository {
  listarAtivos(): Promise<CustoFixo[]>;
  /** Inclui os inativos — a tela de gestão precisa mostrar o que foi desativado. */
  listarTodos(): Promise<CustoFixo[]>;
  obter(id: string): Promise<CustoFixo | null>;
  salvar(custo: CustoFixo): Promise<CustoFixo>;
  /**
   * Remove o cadastro. A FK `PagamentoFixo.custoFixoId` é Restrict: se houver
   * pagamento registrado, o banco recusa e o adapter traduz a violação para
   * `RestricaoDeIntegridadeError` — nunca deixa o erro cru do driver subir.
   * Quem chama decide o que fazer com isso (o caso de uso oferece desativar).
   */
  excluir(id: string): Promise<void>;
}

/**
 * Sinaliza que o banco recusou uma exclusão por violação de integridade
 * referencial (ex.: FK `Restrict` do Postgres, código Prisma P2003) — existe
 * registro dependente. Os adapters concretos traduzem o erro nativo do driver
 * para esta classe, pura e sem dependência de infraestrutura; o caso de uso a
 * converte no erro nomeado e acionável do domínio (ex.: `CustoFixoEmUsoError`).
 * É o backstop: a checagem preventiva no caso de uso já deveria ter recusado
 * antes, mas uma corrida entre a checagem e a exclusão cai aqui.
 */
export class RestricaoDeIntegridadeError extends Error {
  constructor(recurso: string) {
    super(`${recurso} não pode ser excluído: existem registros dependentes.`);
    this.name = 'RestricaoDeIntegridadeError';
  }
}

/**
 * Sinaliza que a violação de unicidade do banco em `Transacao.itemImportadoId`
 * (Prisma P2002) impediu a criação: o item da fatura JÁ virou uma transação.
 * Segunda tentativa de gravar a mesma linha (duplo clique, retry de rede,
 * duas abas) é o caminho ESPERADO, não uma falha — camada 2 da idempotência
 * da importação (`TASKS-IMPORTACAO.md` §11). O adapter Prisma traduz o erro
 * nativo do driver para esta classe, pura e sem dependência de
 * infraestrutura; `confirmarItemImportado` a reconhece e trata como
 * já-gravado, em vez de propagar falha para o dono.
 */
export class ItemImportadoJaGravadoError extends Error {
  constructor(public readonly itemImportadoId: string) {
    super(`O item de importação ${itemImportadoId} já foi gravado como transação.`);
    this.name = 'ItemImportadoJaGravadoError';
  }
}

/**
 * Rastreamento de "custo fixo pago no ciclo". Marcar/desmarcar precisa ser
 * idempotente: chamar duas vezes `marcarPago` para o mesmo (custoFixoId,
 * cicloId) nunca duplica nem lança erro (a unicidade do schema garante isso
 * no adapter Prisma via upsert/ON CONFLICT).
 */
export interface PagamentoFixoRepository {
  listarPorCiclo(cicloId: string): Promise<PagamentoFixo[]>;
  marcarPago(custoFixoId: string, cicloId: string, pagoEm: DataCivil): Promise<PagamentoFixo>;
  desmarcarPago(custoFixoId: string, cicloId: string): Promise<void>;
  /**
   * Nº de ciclos em que o custo fixo foi marcado como pago — cada linha é um
   * ciclo distinto (unicidade em `(custoFixoId, cicloId)`). Usado para recusar
   * a exclusão do custo fixo com uma mensagem acionável ("aparece em N ciclos
   * já fechados, desative em vez de excluir") antes de bater na FK Restrict.
   */
  contarPorCustoFixo(custoFixoId: string): Promise<number>;
  /**
   * O mesmo de `contarPorCustoFixo`, para TODOS os custos fixos do dono numa
   * consulta só. A tela de gestão precisa saber, para cada linha da lista, se
   * o custo pode ou não ser excluído — perguntar um a um seria N+1 num
   * caminho que roda a cada render da página.
   *
   * Custo sem nenhum pagamento simplesmente não aparece na chave (agregação),
   * então quem lê trata a ausência como zero.
   */
  contarPorCustoFixoAgrupado(): Promise<Record<string, number>>;
}

export interface ProvisaoRepository {
  listarAtivas(): Promise<ProvisaoAnual[]>;
  /** Inclui as inativas — a tela de gestão precisa mostrar o que foi desativado. */
  listarTodas(): Promise<ProvisaoAnual[]>;
  obter(id: string): Promise<ProvisaoAnual | null>;
  salvar(provisao: ProvisaoAnual): Promise<ProvisaoAnual>;
  ajustarAcumulado(id: string, deltaCents: number): Promise<void>;
  /**
   * Remove o cadastro. Cabe ao caso de uso recusar quando
   * `acumuladoCents != 0` — apagar aqui jogaria fora dinheiro já reservado.
   * A FK `Transacao.provisaoId` é Restrict: se houver gasto lançado, o banco
   * recusa e o adapter traduz a violação para `RestricaoDeIntegridadeError`.
   */
  excluir(id: string): Promise<void>;
}

/** Delta a somar em `Conta.saldoCents`. Centavos Int, pode ser negativo. */
export interface AjusteConta {
  contaId: string;
  deltaCents: number;
}

/** Delta a somar em `ProvisaoAnual.acumuladoCents`. Centavos Int, pode ser negativo. */
export interface AjusteProvisao {
  provisaoId: string;
  deltaCents: number;
}

/**
 * Um conjunto de escritas que precisa acontecer TUDO OU NADA (ver
 * `TransacaoRepository.aplicarLote`). A ordem de aplicação é fixa e faz parte
 * do contrato: primeiro as exclusões, depois as criações, depois os ajustes.
 */
export interface LoteTransacional {
  /** Ids de `Transacao` a apagar. Id de outro dono simplesmente não casa. */
  excluir?: readonly string[];
  criar?: readonly Transacao[];
  /**
   * Deltas JÁ AGREGADOS por conta. O caso de uso soma os efeitos das
   * transações do lote (via `efeitosDe`) antes de chamar — o repositório não
   * conhece regra de sinal por tipo de transação, isso é domínio.
   */
  ajustesConta?: readonly AjusteConta[];
  ajustesProvisao?: readonly AjusteProvisao[];
}

export interface TransacaoRepository {
  obter(id: string): Promise<Transacao | null>;
  listarPorCiclo(cicloId: string): Promise<Transacao[]>;
  listarPorIntervalo(inicio: DataCivil, fim: DataCivil): Promise<Transacao[]>;
  /**
   * As parcelas de um parcelamento, em ordem de competência.
   *
   * ORDEM É CONTRATO, não detalhe do adapter: `data` crescente e, para
   * empates, `parcelaNum` crescente. Quem depender disso ainda assim deve
   * derivar agregados por `max`/`min` em vez de por `.at(-1)` — duas parcelas
   * podem cair no mesmo dia, e um adapter novo não pode virar bug de dinheiro.
   */
  listarPorParcelamento(parcelamentoId: string): Promise<Transacao[]>;
  criar(transacao: Transacao): Promise<Transacao>;
  criarVarias(transacoes: readonly Transacao[]): Promise<Transacao[]>;
  atualizar(id: string, patch: Partial<Transacao>): Promise<Transacao>;
  excluir(id: string): Promise<void>;
  /**
   * Aplica um lote de escritas numa ÚNICA transação de banco.
   *
   * Existe por causa de um modo de falha real (TASKS-CUSTOS §5.1 ticket 1):
   * cancelar as parcelas futuras fazia `ajustarSaldo(-1)` → `ajustarAcumulado(-1)`
   * → `excluir` em três round-trips POR PARCELA. Uma falha no meio deixava o
   * saldo creditado de uma parcela que continuava viva, e o retry creditava de
   * novo — dinheiro inventado, sem erro nenhum na tela.
   *
   * Devolve as transações criadas (vazio quando o lote só apaga).
   */
  aplicarLote(lote: LoteTransacional): Promise<Transacao[]>;
  vincularCicloPorData(cicloId: string, inicio: DataCivil, fim: DataCivil): Promise<number>;
  /**
   * Marca/desmarca a parcela (Transacao) como paga. `pagoEm: null` desmarca.
   * Idempotente: marcar a mesma parcela duas vezes só reescreve `pagoEm`.
   */
  marcarPaga(transacaoId: string, pagoEm: DataCivil | null): Promise<Transacao>;
}

export interface ParcelamentoRepository {
  criar(parcelamento: Parcelamento): Promise<Parcelamento>;
  /** Busca parcelamentos por id (ex.: para enriquecer as parcelas de um ciclo). Ids desconhecidos são omitidos. */
  listarPorIds(ids: readonly string[]): Promise<Parcelamento[]>;
  /** Todos os parcelamentos do dono, em andamento e encerrados. */
  listar(): Promise<Parcelamento[]>;
  obter(id: string): Promise<Parcelamento | null>;
  /**
   * Atualiza campos do cadastro. NÃO mexe nas parcelas (`Transacao`) — quem
   * decide quais parcelas podem ser regeradas é o caso de uso, que precisa
   * preservar as pagas e as de ciclo fechado.
   */
  atualizar(id: string, patch: Partial<Parcelamento>): Promise<Parcelamento>;
}

export interface CicloRepository {
  obter(id: string): Promise<Ciclo | null>;
  obterPorInicio(dataInicio: DataCivil): Promise<Ciclo | null>;
  obterAtual(hoje: DataCivil): Promise<Ciclo | null>;
  ultimoFechado(): Promise<Ciclo | null>;
  ultimosFechados(n: number): Promise<Ciclo[]>;
  /**
   * Cria o ciclo de forma idempotente por `dataInicio` (constraint única no
   * schema). Sob corrida (dois `garantirCicloAtual` concorrentes tentando
   * criar o mesmo intervalo), só uma chamada vence a inserção; as demais
   * detectam a violação de unicidade e devolvem o ciclo do vencedor.
   * `criado` indica se ESTA chamada foi quem inseriu (para só ela vincular
   * transações órfãs e evitar duplicar o vínculo).
   */
  criarSeAusente(ciclo: Ciclo): Promise<{ ciclo: Ciclo; criado: boolean }>;
  atualizar(id: string, patch: Partial<Ciclo>): Promise<Ciclo>;
  /**
   * Marca o ciclo como fechado SÓ se ainda estiver aberto (transição atômica).
   * Devolve true se este chamado foi quem fechou; false se já estava fechado.
   * Evita crédito de provisão/sobra em dobro num duplo-clique/retry.
   */
  fecharSePendente(id: string, patch: Partial<Ciclo>): Promise<boolean>;
}

export interface PatrimonioRepository {
  ultimoSnapshot(): Promise<SnapshotPatrimonio | null>;
  ultimosSnapshots(n: number): Promise<SnapshotPatrimonio[]>;
  /**
   * Cria o snapshot da data, SUBSTITUINDO o que já existir nela.
   *
   * Há no máximo um snapshot por data (`@@unique([donoId, data])`), e refazer
   * a fotografia do mesmo dia é correção — foi digitada à mão, erra-se. Antes
   * disso a segunda gravação estourava a constraint e o erro cru do Prisma
   * vazava para a tela, sem caminho nenhum para corrigir.
   */
  salvar(snapshot: SnapshotPatrimonio): Promise<SnapshotPatrimonio>;
}
