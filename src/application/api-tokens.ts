/**
 * Casos de uso de GESTÃO de tokens da API do agente (feat/agent-api-v1).
 *
 * Chamados pelo DONO via sessão normal (cookie, `criarDeps()`) — nunca pelo
 * próprio agente autenticado por token: a credencial não pode criar ou
 * revogar credenciais (mesmo espírito de D-8 — quem decide o acesso é
 * humano). `exigirOwner` é a primeira linha de cada caso de uso, antes de
 * qualquer I/O (TASKS-AUTH §2.3).
 */
import { createHash, randomBytes } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { exigirOwner } from '@/domain/auth/permissoes';
import { assertData, type DataCivil } from '@/shared/data';
import type { EscopoAgente } from '@/domain/auth/api-token';
import type { ApiTokenRegistro } from '@/domain/ports/api-tokens';
import type { Deps } from './deps';

const PREFIXO_TOKEN = 'mfa_';
/** `mfa_` + 8 caracteres do token, para a UI exibir "mfa_AbCd1234…". */
const TAMANHO_PREFIXO_EXIBIVEL = PREFIXO_TOKEN.length + 8;

const ESCOPOS_VALIDOS: readonly EscopoAgente[] = ['read', 'write', 'admin'];

/** Forma pública de um token — nunca inclui `hash` (sem motivo para expor um SHA-256, mesmo não reversível). */
export interface ApiTokenResumo {
  id: string;
  nome: string;
  prefixo: string;
  escopos: readonly EscopoAgente[];
  criadoEm: Date;
  ultimoUsoEm: Date | null;
  expiraEm: Date | null;
  revogadoEm: Date | null;
}

export interface NovoTokenInput {
  nome: string;
  escopos: readonly EscopoAgente[];
  /** `null`/omitido = sem expiração. */
  expiraEm?: Date | null;
}

export interface TokenCriado {
  /** O token CRU — existe só nesta resposta. Só o hash dele é persistido. */
  token: string;
  registro: ApiTokenResumo;
}

function paraResumo(registro: ApiTokenRegistro): ApiTokenResumo {
  return {
    id: registro.id,
    nome: registro.nome,
    prefixo: registro.prefixo,
    escopos: registro.escopos,
    criadoEm: registro.criadoEm,
    ultimoUsoEm: registro.ultimoUsoEm,
    expiraEm: registro.expiraEm,
    revogadoEm: registro.revogadoEm,
  };
}

/**
 * A tela de criação de token só coleta uma data civil ("expira em"), nunca um
 * instante — então "expira em 2026-12-31" precisa virar o ÚLTIMO instante
 * daquele dia CIVIL, no timezone da Config, não em UTC (o mesmo cuidado da
 * regra 2 do CLAUDE.md, aqui para o lado da expiração em vez do lado do
 * "hoje"). `fromZonedTime` (date-fns-tz) é o inverso de `dataCivilNoFuso`
 * (`shared/data.ts`): converte um horário de parede NO FUSO dado para o
 * instante UTC equivalente.
 */
export function calcularExpiraEmFimDoDia(dataCivil: DataCivil, timezone: string): Date {
  assertData(dataCivil, 'expiraEm');
  return fromZonedTime(`${dataCivil}T23:59:59.999`, timezone);
}

/** CSPRNG, nunca `Math.random` — mesmo padrão de `sessao-cookie.ts`. */
export function gerarTokenCru(): string {
  return `${PREFIXO_TOKEN}${randomBytes(32).toString('base64url')}`;
}

/** SHA-256 hex — o que fica gravado no banco (ver `ApiToken.hash`). */
export function hashDoTokenAgente(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function validarEntrada(input: NovoTokenInput): void {
  if (input.nome.trim() === '') {
    throw new Error('Nome do token é obrigatório.');
  }
  if (input.escopos.length === 0) {
    throw new Error('Escolha ao menos um escopo para o token.');
  }
  if (!input.escopos.every((e) => ESCOPOS_VALIDOS.includes(e))) {
    throw new Error(`Escopo inválido. Use um de: ${ESCOPOS_VALIDOS.join(', ')}.`);
  }
}

/**
 * Gera uma credencial nova. O token CRU é devolvido UMA ÚNICA VEZ, aqui — a
 * partir deste retorno ele não existe mais em lugar nenhum que o app
 * controle (só o hash, em `ApiToken.hash`).
 */
export async function criarToken(deps: Deps, input: NovoTokenInput): Promise<TokenCriado> {
  exigirOwner(deps.ator);
  validarEntrada(input);

  const token = gerarTokenCru();
  const registro = await deps.apiTokens.criar({
    nome: input.nome.trim(),
    prefixo: token.slice(0, TAMANHO_PREFIXO_EXIBIVEL),
    hash: hashDoTokenAgente(token),
    escopos: input.escopos,
    expiraEm: input.expiraEm ?? null,
  });

  return { token, registro: paraResumo(registro) };
}

export async function listarTokens(deps: Deps): Promise<ApiTokenResumo[]> {
  exigirOwner(deps.ator);
  const registros = await deps.apiTokens.listar();
  return registros.map(paraResumo);
}

export async function revogarToken(deps: Deps, id: string): Promise<void> {
  exigirOwner(deps.ator);
  await deps.apiTokens.revogar(id, deps.relogio.agora());
}
