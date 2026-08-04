/**
 * Cadastro de novo usuário.
 *
 * >>> POR QUE EXIGE CÓDIGO DE CONVITE <<<
 * Este app atende numa porta local e guarda o controle financeiro de quem o
 * usa. Cadastro aberto significaria que qualquer um que alcance a porta cria
 * uma conta — e, com ela, uma sessão válida dentro do processo que fala com o
 * seu banco de dados. O código é o que separa "convidei alguém" de "qualquer um
 * entra". Sem `CADASTRO_CODIGO` no ambiente, o cadastro fica DESLIGADO (falha
 * fechada), e a rota /cadastro nem aparece.
 *
 * Cada usuário novo nasce **OWNER do próprio workspace**: no modelo
 * multi-tenant ele não vê nada de ninguém, então não faria sentido nascer
 * VIEWER — seria alguém sem permissão de escrever nos próprios dados.
 */
import { type Ator } from '@/domain/auth/ator';
import { EmailJaUsadoError } from '@/domain/ports/usuarios';
import type { Deps } from './deps';

/** 3 cadastros por hora e por origem. Cadastro é raro; abuso não deve ser barato. */
const LIMITE_CADASTROS = 3;
const JANELA_CADASTROS_MS = 60 * 60 * 1000;

/**
 * Piso de senha. 12 caracteres sem exigir "1 maiúscula, 1 símbolo": regras de
 * composição empurram para `Senha@123`, que é pior que uma frase longa. O que
 * protege de verdade aqui é o Argon2id.
 */
export const TAMANHO_MINIMO_SENHA = 12;

export class CadastroDesabilitadoError extends Error {
  constructor() {
    super('O cadastro está desabilitado.');
    this.name = 'CadastroDesabilitadoError';
  }
}

export class CadastroInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'CadastroInvalidoError';
  }
}

export interface EntradaCadastro {
  email: string;
  senha: string;
  nome?: string;
  codigo: string;
  /** Origem (IP), para compor a chave do rate limit. */
  origem?: string;
}

/** `true` quando há um código configurado — é o que liga a tela de cadastro. */
export function cadastroHabilitado(codigoEsperado: string | undefined): boolean {
  return typeof codigoEsperado === 'string' && codigoEsperado.length > 0;
}

/**
 * Comparação em tempo constante para o código de convite. Um `===` vaza, pelo
 * tempo de resposta, quantos caracteres iniciais estavam certos — o que torna
 * viável adivinhar o código caractere a caractere.
 */
function codigoConfere(informado: string, esperado: string): boolean {
  if (informado.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < informado.length; i += 1) {
    diferenca |= informado.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

export async function cadastrar(
  deps: Deps,
  entrada: EntradaCadastro,
  codigoEsperado: string | undefined,
): Promise<Ator> {
  if (!cadastroHabilitado(codigoEsperado)) throw new CadastroDesabilitadoError();

  // Limite ANTES de qualquer trabalho caro (hash) ou de qualquer consulta que
  // possa virar oráculo de "este email existe?".
  const permitido = await deps.rateLimiter.permitir(
    `cadastro:${entrada.origem ?? 'desconhecida'}`,
    LIMITE_CADASTROS,
    JANELA_CADASTROS_MS,
  );
  if (!permitido) {
    throw new CadastroInvalidoError('Muitas tentativas. Tente novamente mais tarde.');
  }

  if (!codigoConfere(entrada.codigo, codigoEsperado as string)) {
    // Mesma mensagem para código errado e código ausente: não confirma sequer
    // o formato do código válido.
    throw new CadastroInvalidoError('Código de convite inválido.');
  }

  const email = entrada.email.trim().toLowerCase();
  if (!email.includes('@')) throw new CadastroInvalidoError('Email inválido.');

  if (entrada.senha.length < TAMANHO_MINIMO_SENHA) {
    throw new CadastroInvalidoError(
      `A senha precisa de ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`,
    );
  }

  const senhaHash = await deps.hashSenha.hashear(entrada.senha);

  let usuario;
  try {
    usuario = await deps.usuarios.criar({
      email,
      senhaHash,
      papel: 'OWNER', // dono do próprio workspace — ver o comentário do topo
      nome: entrada.nome?.trim() || null,
    });
  } catch (erro) {
    if (erro instanceof EmailJaUsadoError) {
      // Aqui revelar "já existe" é aceitável e necessário: quem passou pelo
      // código de convite já é alguém convidado, e sem essa informação a
      // pessoa não teria como saber que deve ir para a tela de login.
      throw new CadastroInvalidoError('Este email já tem conta. Faça login.');
    }
    throw erro;
  }

  // O workspace (Config, categorias e contas base) é semeado no primeiro
  // acesso pelo composition root — ver `semearWorkspace` em src/composition.ts.
  await deps.sessoes.criar(usuario.id);
  return { id: usuario.id, papel: usuario.papel };
}
