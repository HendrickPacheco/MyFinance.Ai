/**
 * Casos de uso de autenticação. Orquestram portas — nenhum acesso a Prisma,
 * nenhum `next/headers`, nenhuma regra de cálculo financeiro.
 */
import { ATOR_ANONIMO, type Ator } from '@/domain/auth/ator';
import type { Deps } from './deps';

/** 5 tentativas por 15 minutos, por email+origem (TASKS-AUTH §6). */
const LIMITE_TENTATIVAS = 5;
const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

/**
 * Mensagem ÚNICA para todos os modos de falha de login: email inexistente,
 * senha errada, usuário desativado, conta sem senha local. Distinguir os casos
 * entregaria a um atacante um oráculo de "este email tem conta aqui".
 */
const FALHA_LOGIN = 'Email ou senha inválidos.';
const FALHA_LIMITE = 'Muitas tentativas. Tente novamente em alguns minutos.';

export class FalhaLoginError extends Error {
  constructor(mensagem = FALHA_LOGIN) {
    super(mensagem);
    this.name = 'FalhaLoginError';
  }
}

export interface EntradaLogin {
  email: string;
  senha: string;
  /** Origem da requisição (IP), para compor a chave do rate limit. */
  origem?: string;
}

export async function login(deps: Deps, entrada: EntradaLogin): Promise<Ator> {
  const email = entrada.email.trim().toLowerCase();
  const chave = `login:${email}:${entrada.origem ?? 'desconhecida'}`;

  // O limite é consultado ANTES de qualquer verificação de senha: é o que
  // impede que o Argon2id vire um amplificador de custo para nós mesmos.
  const permitido = await deps.rateLimiter.permitir(
    chave,
    LIMITE_TENTATIVAS,
    JANELA_TENTATIVAS_MS,
  );
  if (!permitido) throw new FalhaLoginError(FALHA_LIMITE);

  const usuario = await deps.usuarios.porEmail(email);

  // Usuário ausente/inativo/sem senha: ainda assim gastamos o tempo de um
  // hash, para que o tempo de resposta não revele se o email existe.
  if (!usuario || !usuario.ativo || !usuario.senhaHash) {
    await deps.hashSenha.verificar(entrada.senha, HASH_ISCA);
    throw new FalhaLoginError();
  }

  const confere = await deps.hashSenha.verificar(entrada.senha, usuario.senhaHash);
  if (!confere) throw new FalhaLoginError();

  await deps.sessoes.criar(usuario.id);
  return { id: usuario.id, papel: usuario.papel };
}

export async function logout(deps: Deps): Promise<void> {
  await deps.sessoes.invalidar();
}

/** Ator da requisição corrente; anônimo quando não há sessão válida. */
export async function atorDaRequisicao(deps: Deps): Promise<Ator> {
  const ator = await deps.sessoes.validar();
  return ator ?? ATOR_ANONIMO;
}

/**
 * Hash Argon2id de uma senha aleatória descartada, usado só para consumir
 * tempo quando o usuário não existe. O valor é público de propósito — o
 * segredo não é o hash, é a uniformidade do tempo de resposta.
 */
const HASH_ISCA =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsLWNvbnN0YW50ZS1pc2Nh$Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9v';
