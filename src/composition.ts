/**
 * Composition root. ÚNICO lugar que conhece infraestrutura concreta e a
 * conecta às portas. Server actions e páginas chamam `criarDeps()` e passam o
 * bag para os casos de uso. O relógio respeita o timezone da Config.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/infrastructure/persistence/prisma';
import { RelogioSistema } from '@/infrastructure/relogio/relogio-sistema';
import {
  PrismaConfigRepository,
  PrismaContaRepository,
  PrismaCategoriaRepository,
  PrismaCustoFixoRepository,
  PrismaPagamentoFixoRepository,
  PrismaProvisaoRepository,
  PrismaTransacaoRepository,
  PrismaParcelamentoRepository,
  PrismaCicloRepository,
  PrismaPatrimonioRepository,
} from '@/infrastructure/repositories/prisma-repositories';
import { embeddingHabilitado, iaHabilitada } from '@/infrastructure/ia/config-ia';
import { criarProvedorIA } from '@/infrastructure/ia/provedor-ia';
import { criarEmbeddingIA } from '@/infrastructure/ia/embeddings';
import { PrismaMemoriaRepository } from '@/infrastructure/repositories/prisma-memoria';
import { PrismaConversaRepository } from '@/infrastructure/repositories/prisma-conversa';
import { PrismaImportacaoRepository } from '@/infrastructure/repositories/prisma-importacao';
import {
  PrismaUsuarioRepository,
  PrismaSessaoRepository,
} from '@/infrastructure/repositories/prisma-identidade';
import { PrismaApiTokenRepository } from '@/infrastructure/repositories/prisma-api-tokens';
import { PrismaAuditoriaAgenteRepository } from '@/infrastructure/repositories/prisma-auditoria';
import { PrismaIdempotenciaAgenteRepository } from '@/infrastructure/repositories/prisma-idempotencia';
import { Argon2HashSenha } from '@/infrastructure/auth/argon2';
import { SessaoCookie } from '@/infrastructure/auth/sessao-cookie';
import { cookieStoreDoNext } from '@/infrastructure/auth/cookie-next';
import { RateLimiterMemoria } from '@/infrastructure/seguranca/rate-limiter-memoria';
import { PrismaUsoIARepository } from '@/infrastructure/repositories/prisma-uso-ia';
import { semearWorkspace } from '@/infrastructure/onboarding';
import { ATOR_ANONIMO, type Ator } from '@/domain/auth/ator';
import type { SessaoPort } from '@/domain/ports/sessao';
import type { Deps } from '@/application/deps';

export { prisma };
export { clienteEmTransacao } from '@/infrastructure/persistence/prisma';

/**
 * O limiter é in-memory por processo, então precisa ser um SINGLETON de módulo.
 * Se fosse criado dentro de `criarDeps()` — que roda por requisição — cada
 * tentativa de login teria seu próprio contador zerado e o limite não
 * limitaria nada.
 */
const rateLimiter = new RateLimiterMemoria();

/** Fuso usado antes de a Config do dono ser lida (e default dela). */
const TIMEZONE_PADRAO = 'America/Bahia';

/**
 * Todo repositório ESCOPADO POR DONO, montado sobre `db` — compartilhado por
 * `criarDeps()` (sessão por cookie) e `criarDepsAgente()` (token do agente),
 * para as duas composições nunca divergirem na lista de repositórios.
 *
 * `db` pode ser o `PrismaClient` raiz OU um cliente de transação adaptado
 * por `clienteEmTransacao` — nenhum repositório aqui sabe a diferença, e é
 * exatamente isso que torna uma escrita do agente atômica (`rotaEscrita`
 * constrói esta mesma lista com o `tx` da transação).
 */
function construirRepositoriosDoDono(db: PrismaClient, donoId: string) {
  return {
    config: new PrismaConfigRepository(db, donoId),
    contas: new PrismaContaRepository(db, donoId),
    categorias: new PrismaCategoriaRepository(db, donoId),
    custosFixos: new PrismaCustoFixoRepository(db, donoId),
    pagamentosFixos: new PrismaPagamentoFixoRepository(db, donoId),
    provisoes: new PrismaProvisaoRepository(db, donoId),
    transacoes: new PrismaTransacaoRepository(db, donoId),
    parcelamentos: new PrismaParcelamentoRepository(db, donoId),
    ciclos: new PrismaCicloRepository(db, donoId),
    patrimonio: new PrismaPatrimonioRepository(db, donoId),
    usoIA: new PrismaUsoIARepository(db),
    // Memória do copiloto (Fase E) — escopada por dono como todo o resto.
    memorias: new PrismaMemoriaRepository(db, donoId),
    // Histórico persistido do copiloto (Fase 1 da persistência de conversas).
    conversas: new PrismaConversaRepository(db, donoId),
    // Rascunho de importação de fatura (I3 do TASKS-IMPORTACAO.md).
    importacoes: new PrismaImportacaoRepository(db, donoId),
    // API do agente de IA externo (feat/agent-api-v1).
    apiTokens: new PrismaApiTokenRepository(db, donoId),
    auditoria: new PrismaAuditoriaAgenteRepository(db, donoId),
    idempotencia: new PrismaIdempotenciaAgenteRepository(db, donoId),
  };
}

/**
 * Sessão por cookie não existe no contexto do agente (ele autentica por
 * token, em `autenticarAgente` — `src/agent-api/`). `criar`/`invalidar` são
 * caminhos que nenhuma rota do agente chama; `validar` devolve `null` em vez
 * de lançar porque é exatamente o que "sem sessão de cookie" significa.
 */
const SESSAO_INDISPONIVEL_NO_AGENTE: SessaoPort = {
  async criar() {
    throw new Error('Sessão por cookie não se aplica à API do agente.');
  },
  async validar() {
    return null;
  },
  async invalidar() {},
};

export async function criarDeps(): Promise<Deps> {
  const usuarios = new PrismaUsuarioRepository(prisma);

  // Ovo e galinha: a Config (que traz o timezone) é escopada por dono, e o dono
  // só é conhecido depois de validar a sessão. A sessão, por sua vez, precisa de
  // um relógio — mas só de `agora()`, um instante absoluto, para comparar com
  // `expiraEm`. Timezone não influi nisso, então a sessão usa um relógio com o
  // fuso padrão e o relógio "de verdade" (com o fuso do dono) nasce depois.
  const relogioSessao = new RelogioSistema(TIMEZONE_PADRAO);
  const sessoes = new SessaoCookie(
    new PrismaSessaoRepository(prisma),
    usuarios,
    relogioSessao,
    await cookieStoreDoNext(),
  );
  // O ator é resolvido AQUI, no servidor, a partir do cookie de sessão —
  // nunca a partir de nada que o cliente mande.
  const ator = (await sessoes.validar()) ?? ATOR_ANONIMO;

  // >>> O ESCOPO DE DADOS SAI DAQUI, E SÓ DAQUI. <<<
  // `donoId` é o id do ator resolvido da SESSÃO. Todo repositório financeiro
  // nasce amarrado a ele, então nenhum caso de uso — e nenhum id vindo do
  // cliente — consegue alcançar dados de outro usuário (TASKS-AUTH §3.2).
  //
  // Requisição sem sessão recebe um donoId vazio, que não casa com nenhuma
  // linha: falha fechada. O middleware e o layout já barram antes, isto é a
  // última rede.
  const donoId = ator.id;

  const repositorios = construirRepositoriosDoDono(prisma, donoId);
  let cfg = await repositorios.config.obter();

  // Onboarding preguiçoso: um usuário recém-criado não tem Config, categorias
  // nem contas — ele nasceria numa tela quebrada. Como a consulta acima já
  // aconteceu, detectar isso é de graça, e `semearWorkspace` é idempotente.
  // Fazer aqui (e não num script manual) garante que ninguém entra num
  // workspace vazio por alguém ter esquecido de rodar um comando.
  if (!cfg && donoId) {
    await semearWorkspace(prisma, donoId);
    cfg = await repositorios.config.obter();
  }

  const relogio = new RelogioSistema(cfg?.timezone ?? TIMEZONE_PADRAO);

  return {
    ator,
    usuarios,
    sessoes,
    hashSenha: new Argon2HashSenha(),
    rateLimiter,
    relogio,
    ...repositorios,
    // Com IA_HABILITADA=false o campo fica `undefined` e nenhuma tela muda.
    ia: iaHabilitada() ? criarProvedorIA() : undefined,
    // Independente de `ia`: sem OPENAI_MODEL_EMBEDDING a memória continua
    // gravando e listando, só a busca semântica degrada.
    embeddings: embeddingHabilitado() ? criarEmbeddingIA() : undefined,
  };
}

/**
 * Composição para a API do agente (`src/agent-api/`, feat/agent-api-v1).
 * Mesma forma de `Deps` que `criarDeps()`, mas:
 *
 *  - `donoId` vem do TOKEN já autenticado (`autenticarAgente`), nunca de um
 *    cookie — o agente não tem sessão por cookie, por isso `sessoes` aqui é
 *    `SESSAO_INDISPONIVEL_NO_AGENTE`;
 *  - `ator` é sempre `{ id: donoId, papel: 'OWNER' }`: a permissão real de
 *    uma requisição de agente é o ESCOPO do token (`read`/`write`/`admin`,
 *    checado por `autenticarAgente` antes de chegar aqui), não o papel
 *    OWNER/VIEWER do app — um agente com escopo `write` deve poder criar uma
 *    transação mesmo que, no futuro, o produto venha a ter um usuário humano
 *    VIEWER (`exigirEscrita` já exigiria OWNER, e é exatamente isso que o
 *    agente sempre é aqui);
 *  - `db` pode ser `prisma` (rotas de leitura) OU um cliente de transação
 *    adaptado por `clienteEmTransacao` (rotas de escrita, para a operação
 *    inteira ser atômica — ver `rotaEscrita` em `src/agent-api/`).
 *
 * Não resolve onboarding (`semearWorkspace`): um token só existe para um
 * dono que já passou pelo onboarding normal via `criarDeps()`.
 */
export async function criarDepsAgente(donoId: string, db: PrismaClient): Promise<Deps> {
  const ator: Ator = { id: donoId, papel: 'OWNER' };
  const repositorios = construirRepositoriosDoDono(db, donoId);
  const cfg = await repositorios.config.obter();
  const relogio = new RelogioSistema(cfg?.timezone ?? TIMEZONE_PADRAO);

  return {
    ator,
    usuarios: new PrismaUsuarioRepository(db),
    sessoes: SESSAO_INDISPONIVEL_NO_AGENTE,
    hashSenha: new Argon2HashSenha(),
    rateLimiter,
    relogio,
    ...repositorios,
    ia: iaHabilitada() ? criarProvedorIA() : undefined,
    embeddings: embeddingHabilitado() ? criarEmbeddingIA() : undefined,
  };
}
