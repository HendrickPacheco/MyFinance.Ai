/**
 * Portas de identidade: usuários e o registro bruto de sessão.
 *
 * `SessaoRepository` é a persistência da sessão (a tabela); `SessaoPort`
 * (ports/sessao.ts) é o caso de uso da sessão (criar/validar/invalidar,
 * incluindo o transporte por cookie). Separá-las deixa o repositório testável
 * sem `next/headers`.
 */
import type { Papel } from '@/domain/auth/ator';
import type { Usuario } from '@/domain/auth/usuario';

export interface NovoUsuario {
  email: string;
  senhaHash: string;
  papel: Papel;
  nome: string | null;
}

export interface UsuarioRepository {
  porEmail(email: string): Promise<Usuario | null>;
  porId(id: string): Promise<Usuario | null>;
  /**
   * Cria o usuário. Lança `EmailJaUsadoError` se o email já existir — a
   * checagem é do BANCO (constraint unique), não um `porEmail` antes: entre a
   * consulta e a inserção cabe uma corrida.
   */
  criar(dados: NovoUsuario): Promise<Usuario>;
}

/** Email já cadastrado. Quem chama decide o que revelar ao usuário final. */
export class EmailJaUsadoError extends Error {
  constructor() {
    super('Email já cadastrado.');
    this.name = 'EmailJaUsadoError';
  }
}

/** Uma linha de `Sessao`. `id` é o HASH do token, nunca o token cru. */
export interface RegistroSessao {
  id: string;
  usuarioId: string;
  expiraEm: Date;
}

export interface SessaoRepository {
  criar(registro: RegistroSessao): Promise<void>;
  porId(id: string): Promise<RegistroSessao | null>;
  /** Renovação deslizante: empurra a expiração da sessão já existente. */
  estender(id: string, expiraEm: Date): Promise<void>;
  excluir(id: string): Promise<void>;
  /** Higiene: remove sessões vencidas. */
  excluirExpiradas(agora: Date): Promise<void>;
}
