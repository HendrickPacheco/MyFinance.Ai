/**
 * Composition root. ÚNICO lugar que conhece infraestrutura concreta e a
 * conecta às portas. Server actions e páginas chamam `criarDeps()` e passam o
 * bag para os casos de uso. O relógio respeita o timezone da Config.
 */
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
import {
  PrismaUsuarioRepository,
  PrismaSessaoRepository,
} from '@/infrastructure/repositories/prisma-identidade';
import { Argon2HashSenha } from '@/infrastructure/auth/argon2';
import { SessaoCookie } from '@/infrastructure/auth/sessao-cookie';
import { cookieStoreDoNext } from '@/infrastructure/auth/cookie-next';
import { RateLimiterMemoria } from '@/infrastructure/seguranca/rate-limiter-memoria';
import { PrismaUsoIARepository } from '@/infrastructure/repositories/prisma-uso-ia';
import { semearWorkspace } from '@/infrastructure/onboarding';
import { ATOR_ANONIMO } from '@/domain/auth/ator';
import type { Deps } from '@/application/deps';

export { prisma };

/**
 * O limiter é in-memory por processo, então precisa ser um SINGLETON de módulo.
 * Se fosse criado dentro de `criarDeps()` — que roda por requisição — cada
 * tentativa de login teria seu próprio contador zerado e o limite não
 * limitaria nada.
 */
const rateLimiter = new RateLimiterMemoria();

/** Fuso usado antes de a Config do dono ser lida (e default dela). */
const TIMEZONE_PADRAO = 'America/Bahia';

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

  const config = new PrismaConfigRepository(prisma, donoId);
  let cfg = await config.obter();

  // Onboarding preguiçoso: um usuário recém-criado não tem Config, categorias
  // nem contas — ele nasceria numa tela quebrada. Como a consulta acima já
  // aconteceu, detectar isso é de graça, e `semearWorkspace` é idempotente.
  // Fazer aqui (e não num script manual) garante que ninguém entra num
  // workspace vazio por alguém ter esquecido de rodar um comando.
  if (!cfg && donoId) {
    await semearWorkspace(prisma, donoId);
    cfg = await config.obter();
  }

  const relogio = new RelogioSistema(cfg?.timezone ?? TIMEZONE_PADRAO);

  return {
    ator,
    usuarios,
    sessoes,
    hashSenha: new Argon2HashSenha(),
    rateLimiter,
    relogio,
    config,
    contas: new PrismaContaRepository(prisma, donoId),
    categorias: new PrismaCategoriaRepository(prisma, donoId),
    custosFixos: new PrismaCustoFixoRepository(prisma, donoId),
    pagamentosFixos: new PrismaPagamentoFixoRepository(prisma, donoId),
    provisoes: new PrismaProvisaoRepository(prisma, donoId),
    transacoes: new PrismaTransacaoRepository(prisma, donoId),
    parcelamentos: new PrismaParcelamentoRepository(prisma, donoId),
    ciclos: new PrismaCicloRepository(prisma, donoId),
    patrimonio: new PrismaPatrimonioRepository(prisma, donoId),
    // Com IA_HABILITADA=false o campo fica `undefined` e nenhuma tela muda.
    ia: iaHabilitada() ? criarProvedorIA() : undefined,
    usoIA: new PrismaUsoIARepository(prisma),
    // Memória do copiloto (Fase E) — escopada por dono como todo o resto.
    memorias: new PrismaMemoriaRepository(prisma, donoId),
    // Independente de `ia`: sem OPENAI_MODEL_EMBEDDING a memória continua
    // gravando e listando, só a busca semântica degrada.
    embeddings: embeddingHabilitado() ? criarEmbeddingIA() : undefined,
  };
}
