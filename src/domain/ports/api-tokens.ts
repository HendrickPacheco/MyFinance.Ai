/**
 * Porta de persistência de credenciais do agente de IA externo (API v1).
 * Mesma disciplina das demais portas de identidade (`ports/usuarios.ts`):
 * fica fora de `domain/finance/` porque não é cálculo, e fora de
 * `infrastructure/` porque não conhece Prisma.
 */
import type { EscopoAgente } from '@/domain/auth/api-token';

export interface ApiTokenRegistro {
  id: string;
  donoId: string;
  nome: string;
  prefixo: string;
  hash: string;
  escopos: readonly EscopoAgente[];
  criadoEm: Date;
  ultimoUsoEm: Date | null;
  expiraEm: Date | null;
  revogadoEm: Date | null;
}

export interface NovoApiToken {
  nome: string;
  prefixo: string;
  hash: string;
  escopos: readonly EscopoAgente[];
  expiraEm: Date | null;
}

/** Id existe, mas é de outro dono (ou não existe — as duas coisas são indistinguíveis de propósito). */
export class ApiTokenNaoEncontradoError extends Error {
  constructor() {
    super('Token não encontrado.');
    this.name = 'ApiTokenNaoEncontradoError';
  }
}

export interface ApiTokenRepository {
  criar(dados: NovoApiToken): Promise<ApiTokenRegistro>;

  /** Só os tokens do dono deste repositório (escopado no construtor, como todo repositório financeiro). */
  listar(): Promise<ApiTokenRegistro[]>;

  /** Lança `ApiTokenNaoEncontradoError` quando o id não existe ou é de outro dono. */
  revogar(id: string, revogadoEm: Date): Promise<void>;

  /** Fire-and-forget do ponto de vista de quem chama (ver `autenticarAgente`) — nunca lança. */
  marcarUsoAgora(id: string, usadoEm: Date): Promise<void>;

  /**
   * ÚNICO método deste repositório que NÃO é escopado por `donoId` — e tem
   * que ser assim por construção: autenticação DESCOBRE o `donoId` a partir
   * do hash do token, então não existe `donoId` ainda para filtrar a
   * consulta por ele (o mesmo problema de ovo-e-galinha que
   * `criarDeps()` resolve para `Config`, documentado em `composition.ts`).
   *
   * Só é chamado por `autenticarAgente` (`src/agent-api/`), numa instância
   * construída sem `donoId` exclusivamente para este propósito. Nenhum outro
   * caminho deste repositório lê ou escreve dados sem o escopo do construtor.
   */
  buscarPorHashParaAutenticar(hash: string): Promise<ApiTokenRegistro | null>;
}
