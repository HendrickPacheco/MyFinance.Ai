/**
 * Erro e mapeamento únicos da API do agente — toda rota (`rotaAgente`/
 * `rotaEscrita`) traduz qualquer exceção para `{ error: { code, message,
 * details? } }` por aqui, nunca ad-hoc dentro do handler.
 */
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import { CicloFechadoError } from '@/application/retroatividade';

/** Erro de borda da API do agente — status e código HTTP são decisão explícita de quem lança. */
export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ErroApi';
  }
}

export interface CorpoErroApi {
  error: { code: string; message: string; details?: unknown };
}

export interface ErroApiMapeado {
  status: number;
  corpo: CorpoErroApi;
}

function corpo(code: string, message: string, details?: unknown): CorpoErroApi {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}

/** P2002 = violação de constraint única (mesmo código que `prisma-repositories.ts` já trata internamente). */
export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

/**
 * Toda classe de erro do app segue o padrão `<Coisa>NaoEncontradoError`
 * (`RecursoNaoEncontradoError`, `ApiTokenNaoEncontradoError`, ...) — checar
 * pelo NOME em vez de importar cada classe mantém este mapeador desacoplado
 * de todo repositório que possa vir a existir.
 */
function ehErroDeNaoEncontrado(erro: Error): boolean {
  return erro.name.includes('NaoEncontrado');
}

/**
 * Traduz qualquer exceção lançada por um handler (ou por tudo que ele chama)
 * para a resposta de erro da API do agente. Pura — sem I/O, só decide; quem
 * loga o 500 bruto é quem chama (`rotaAgente`/`rotaEscrita`), porque só ali
 * existe o `console.error` de propósito (nunca aqui, que também é usado em
 * teste puro).
 */
export function mapearErroApi(erro: unknown): ErroApiMapeado {
  if (erro instanceof ErroApi) {
    return { status: erro.status, corpo: corpo(erro.code, erro.message, erro.details) };
  }

  if (erro instanceof ZodError) {
    return { status: 400, corpo: corpo('VALIDATION_ERROR', 'Entrada inválida.', erro.issues) };
  }

  // Confirmação de edição retroativa (`executarComConfirmacao` nas server
  // actions) — o agente recebe o mesmo convite: reenviar com
  // `confirmarRetroativo: true` no corpo.
  if (erro instanceof CicloFechadoError) {
    return {
      status: 409,
      corpo: corpo('CONFIRMACAO_NECESSARIA', erro.message, {
        ciclosAfetados: [...erro.ciclosAfetados],
      }),
    };
  }

  if (erro instanceof AcessoNegadoError) {
    return { status: 403, corpo: corpo('ACESSO_NEGADO', erro.message) };
  }

  if (ehViolacaoDeUnicidade(erro)) {
    return { status: 409, corpo: corpo('CONFLITO', 'Já existe um registro com esses dados.') };
  }

  // Corpo que não é JSON (vem do `JSON.parse` do kernel).
  if (erro instanceof SyntaxError) {
    return { status: 400, corpo: corpo('JSON_INVALIDO', 'Corpo da requisição não é JSON válido.') };
  }

  // Falha de banco/infra não é regra de negócio: 500 sem vazar a mensagem.
  if (
    erro instanceof Prisma.PrismaClientKnownRequestError ||
    erro instanceof Prisma.PrismaClientUnknownRequestError ||
    erro instanceof Prisma.PrismaClientInitializationError ||
    erro instanceof Prisma.PrismaClientRustPanicError ||
    erro instanceof Prisma.PrismaClientValidationError
  ) {
    return { status: 500, corpo: corpo('ERRO_INTERNO', 'Erro interno.') };
  }

  if (erro instanceof Error) {
    if (ehErroDeNaoEncontrado(erro)) {
      return { status: 404, corpo: corpo('NAO_ENCONTRADO', erro.message) };
    }
    // Toda regra de negócio do domínio/aplicação chega como `Error` comum,
    // mensagem em português, pronta para o agente mostrar ao dono (D-14).
    return { status: 422, corpo: corpo('REGRA_DE_NEGOCIO', erro.message) };
  }

  return { status: 500, corpo: corpo('ERRO_INTERNO', 'Erro interno.') };
}
