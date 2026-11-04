/**
 * Infraestrutura comum dos testes de integração da API do agente
 * (`src/agent-api/__integracao__/*.integracao.test.ts`). Bate no Postgres
 * REAL (`DATABASE_URL` de `.env`, carregado por `setup-env.ts`) — nunca em
 * fake. Todo dono criado aqui é DESCARTÁVEL e identificado por um e-mail com
 * o prefixo `__agentapi_`, nunca toca o OWNER real.
 *
 * REGRA ABSOLUTA (ver prompt da tarefa): todo teste cria os próprios donos e
 * os apaga no fim. `comIsolamentoDeContagens` é o guarda-corpo disso — mede
 * as tabelas financeiras ANTES de qualquer dono de teste nascer e DEPOIS de
 * todos serem apagados; se algo sobrar ou faltar, o teste falha.
 */
import { PrismaClient } from '@prisma/client';
import { criarDepsAgente } from '@/composition';
import { semearWorkspace } from '@/infrastructure/onboarding';
import { criarToken } from '@/application/api-tokens';
import { garantirCicloAtual } from '@/application/ciclos';
import type { EscopoAgente } from '@/domain/auth/api-token';

export const prisma = new PrismaClient();

let contador = 0;

/** E-mail descartável e único por teste — nunca colide com o OWNER real. */
export function emailDeTeste(rotulo: string): string {
  contador += 1;
  return `__agentapi_${rotulo}_${Date.now()}_${contador}@teste.local`;
}

export interface DonoDeTeste {
  donoId: string;
  contaReservaId: string;
  contaVariavelId: string;
  categoriaMercadoId: string;
}

/**
 * Cria um dono descartável + workspace semeado (Config, 4 contas base, 14
 * categorias base — mesmo caminho que um usuário real percorre no primeiro
 * acesso, via `semearWorkspace`).
 */
export async function criarDonoDeTeste(rotulo: string): Promise<DonoDeTeste> {
  const usuario = await prisma.usuario.create({
    data: { email: emailDeTeste(rotulo), papel: 'OWNER', senhaHash: null },
  });
  await semearWorkspace(prisma, usuario.id);

  const [contaReserva, contaVariavel, categoriaMercado] = await Promise.all([
    prisma.conta.findFirstOrThrow({ where: { donoId: usuario.id, tipo: 'RESERVA' } }),
    prisma.conta.findFirstOrThrow({ where: { donoId: usuario.id, tipo: 'VARIAVEL' } }),
    prisma.categoria.findFirstOrThrow({ where: { donoId: usuario.id, nome: 'Mercado' } }),
  ]);

  return {
    donoId: usuario.id,
    contaReservaId: contaReserva.id,
    contaVariavelId: contaVariavel.id,
    categoriaMercadoId: categoriaMercado.id,
  };
}

/** Apaga um dono de teste e (via cascade do schema) tudo que pertence a ele. */
export async function apagarDonoDeTeste(donoId: string): Promise<void> {
  await prisma.usuario.deleteMany({ where: { id: donoId } });
}

export interface TokenDeTeste {
  token: string;
  tokenId: string;
}

/** Cria uma credencial de agente de verdade (hash no banco, token cru só aqui). */
export async function criarTokenDeTeste(
  donoId: string,
  escopos: readonly EscopoAgente[],
  opcoes: { expiraEm?: Date | null } = {},
): Promise<TokenDeTeste> {
  const deps = await criarDepsAgente(donoId, prisma);
  const { token, registro } = await criarToken(deps, {
    nome: `token de teste (${escopos.join(',')})`,
    escopos,
    expiraEm: opcoes.expiraEm ?? null,
  });
  return { token, tokenId: registro.id };
}

export async function revogarTokenDeTeste(donoId: string, tokenId: string): Promise<void> {
  await prisma.apiToken.updateMany({ where: { id: tokenId, donoId }, data: { revogadoEm: new Date() } });
}

/**
 * Ajusta a Config do dono de teste direto no banco (mais rápido e mais
 * explícito que ir pelo PATCH /config em todo setup) e garante que existe um
 * ciclo cobrindo HOJE — necessário para `impactoCiclo`/`GET /contexto`
 * mostrarem antes≠depois. `diaRecebimento: 1` faz o ciclo coincidir com o
 * mês civil, sem relação com o dia real do dono.
 */
export async function prepararCicloAberto(
  donoId: string,
  opcoes: {
    rendaBaseCents?: number;
    metaPoupancaCents?: number;
    destinoSobra?: 'RESERVA' | 'INVESTIMENTO' | 'ROLLOVER';
    destinoSobraContaId?: string | null;
  } = {},
): Promise<void> {
  await prisma.config.update({
    where: { donoId },
    data: {
      rendaBaseCents: opcoes.rendaBaseCents ?? 3_000_000,
      diaRecebimento: 1,
      metaPoupancaCents: opcoes.metaPoupancaCents ?? 0,
      destinoSobra: opcoes.destinoSobra ?? 'RESERVA',
      destinoSobraContaId: opcoes.destinoSobraContaId ?? null,
    },
  });
  const deps = await criarDepsAgente(donoId, prisma);
  await garantirCicloAtual(deps);
}

// ─────────────────────────────────────────────────────────────────────────
// Requisições HTTP contra os route handlers, direto (sem servidor subindo).
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost/api/agent/v1';

export interface OpcoesRequisicao {
  token?: string | null;
  body?: unknown;
  /** Corpo cru (string), para testar JSON malformado — sobrepõe `body`. */
  corpoCru?: string;
  query?: Record<string, string>;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

function montarUrl(caminho: string, query?: Record<string, string>): string {
  const url = new URL(`${BASE_URL}${caminho}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

export function montarRequisicao(
  metodo: string,
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Request {
  const headers = new Headers(opcoes.headers);
  if (opcoes.token !== null) {
    headers.set('authorization', `Bearer ${opcoes.token ?? 'token-invalido-qualquer'}`);
  }
  if (opcoes.idempotencyKey) headers.set('idempotency-key', opcoes.idempotencyKey);

  let corpo: string | undefined;
  if (opcoes.corpoCru !== undefined) {
    corpo = opcoes.corpoCru;
  } else if (opcoes.body !== undefined) {
    corpo = JSON.stringify(opcoes.body);
  }
  if (corpo !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new Request(montarUrl(caminho, opcoes.query), {
    method: metodo,
    headers,
    body: corpo,
  });
}

type SegundoArgumento = { params: Promise<Record<string, string>> };
type HandlerDeRota = (req: Request, segundo: SegundoArgumento) => Promise<Response>;

/** Chama um handler de rota exatamente como o Next.js chamaria (params é Promise no Next 15). */
export async function chamar(
  handler: HandlerDeRota,
  req: Request,
  params: Record<string, string> = {},
): Promise<Response> {
  return handler(req, { params: Promise.resolve(params) });
}

export async function chamarJson<T = Record<string, unknown>>(
  handler: HandlerDeRota,
  req: Request,
  params: Record<string, string> = {},
): Promise<{ status: number; headers: Headers; corpo: T }> {
  const resposta = await chamar(handler, req, params);
  const texto = await resposta.text();
  const corpo = (texto.trim() === '' ? undefined : JSON.parse(texto)) as T;
  return { status: resposta.status, headers: resposta.headers, corpo };
}

// ─────────────────────────────────────────────────────────────────────────
// Guarda-corpo de isolamento: nenhuma tabela financeira do OWNER real muda.
// ─────────────────────────────────────────────────────────────────────────

/** Tabelas financeiras + as três novas da API do agente (feat/agent-api-v1). */
async function contarTudo(): Promise<Record<string, number>> {
  const [
    usuario,
    config,
    conta,
    categoria,
    custoFixo,
    pagamentoFixo,
    provisaoAnual,
    transacao,
    parcelamento,
    ciclo,
    apiToken,
    auditoriaAgente,
    idempotenciaAgente,
  ] = await Promise.all([
    prisma.usuario.count(),
    prisma.config.count(),
    prisma.conta.count(),
    prisma.categoria.count(),
    prisma.custoFixo.count(),
    prisma.pagamentoFixo.count(),
    prisma.provisaoAnual.count(),
    prisma.transacao.count(),
    prisma.parcelamento.count(),
    prisma.ciclo.count(),
    prisma.apiToken.count(),
    prisma.auditoriaAgente.count(),
    prisma.idempotenciaAgente.count(),
  ]);
  return {
    usuario,
    config,
    conta,
    categoria,
    custoFixo,
    pagamentoFixo,
    provisaoAnual,
    transacao,
    parcelamento,
    ciclo,
    apiToken,
    auditoriaAgente,
    idempotenciaAgente,
  };
}

/**
 * Envolve o corpo de um arquivo de teste (chamar de dentro de `beforeAll`/
 * `afterAll`, não por teste individual — contagem é cara e os testes de um
 * arquivo compartilham os donos criados). Uso:
 *
 *   let snapshot: () => Promise<void>;
 *   beforeAll(async () => { snapshot = await iniciarGuardaDeIsolamento(); });
 *   afterAll(async () => { await limparTudo(); await snapshot(); });
 */
export async function iniciarGuardaDeIsolamento(): Promise<() => Promise<void>> {
  const antes = await contarTudo();
  return async () => {
    const depois = await contarTudo();
    if (JSON.stringify(antes) !== JSON.stringify(depois)) {
      throw new Error(
        `Isolamento violado — contagens de tabela mudaram.\nAntes:  ${JSON.stringify(antes)}\nDepois: ${JSON.stringify(depois)}`,
      );
    }
  };
}
