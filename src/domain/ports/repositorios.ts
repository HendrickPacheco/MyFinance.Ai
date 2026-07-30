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
  salvar(custo: CustoFixo): Promise<CustoFixo>;
}

export interface ProvisaoRepository {
  listarAtivas(): Promise<ProvisaoAnual[]>;
  salvar(provisao: ProvisaoAnual): Promise<ProvisaoAnual>;
  ajustarAcumulado(id: string, deltaCents: number): Promise<void>;
}

export interface TransacaoRepository {
  listarPorCiclo(cicloId: string): Promise<Transacao[]>;
  listarPorIntervalo(inicio: DataCivil, fim: DataCivil): Promise<Transacao[]>;
  criar(transacao: Transacao): Promise<Transacao>;
  criarVarias(transacoes: readonly Transacao[]): Promise<Transacao[]>;
  atualizar(id: string, patch: Partial<Transacao>): Promise<Transacao>;
  excluir(id: string): Promise<void>;
  vincularCicloPorData(cicloId: string, inicio: DataCivil, fim: DataCivil): Promise<number>;
}

export interface ParcelamentoRepository {
  criar(parcelamento: Parcelamento): Promise<Parcelamento>;
}

export interface CicloRepository {
  obterPorInicio(dataInicio: DataCivil): Promise<Ciclo | null>;
  obterAtual(hoje: DataCivil): Promise<Ciclo | null>;
  ultimoFechado(): Promise<Ciclo | null>;
  ultimosFechados(n: number): Promise<Ciclo[]>;
  criar(ciclo: Ciclo): Promise<Ciclo>;
  atualizar(id: string, patch: Partial<Ciclo>): Promise<Ciclo>;
}

export interface PatrimonioRepository {
  ultimoSnapshot(): Promise<SnapshotPatrimonio | null>;
  ultimosSnapshots(n: number): Promise<SnapshotPatrimonio[]>;
  criar(snapshot: SnapshotPatrimonio): Promise<SnapshotPatrimonio>;
}
