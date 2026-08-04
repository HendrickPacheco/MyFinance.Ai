/**
 * Middleware: autenticação COARSE + CSP com nonce (TASKS-AUTH §2.3, §5.6).
 *
 * ── Autenticação ──
 * LIMITE IMPORTANTE, e a razão de a defesa real não morar aqui: o middleware
 * roda no runtime Edge, onde o Prisma Client não existe. Ele consegue ver se
 * HÁ um cookie de sessão, não se esse cookie é VÁLIDO. Um cookie forjado ou
 * expirado passa por aqui.
 *
 * Por isso a validação de verdade acontece em dois pontos no runtime Node:
 *  - `app/layout.tsx` valida a sessão contra o banco e manda para /login quem
 *    não tiver ator autenticado (fecha a leitura);
 *  - cada caso de uso de escrita chama `exigirEscrita(deps.ator)` (fecha a
 *    escrita e o IDOR).
 *
 * O papel deste arquivo é economizar trabalho: cortar cedo quem nem cookie tem.
 * Ele NUNCA decide papel.
 *
 * ── CSP ──
 * A CSP é montada AQUI, por requisição, e não estaticamente em
 * `next.config.ts`. Motivo concreto: o Next injeta scripts inline com o payload
 * RSC em toda página. Uma CSP estática só poderia autorizá-los com
 * `unsafe-inline` (que anula a diretiva) ou com hashes que mudam a cada build.
 * Com nonce por requisição, o Next carimba os próprios scripts automaticamente
 * (ele lê o nonce do header de CSP da requisição) e a política continua estrita.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SIDEBAR_ANTI_FLASH_SCRIPT } from '@/shared/anti-flash-script';

const COOKIE_SESSAO = 'sessao';

/** Únicas rotas alcançáveis sem sessão. */
const ROTAS_PUBLICAS = ['/login', '/cadastro'];

/**
 * Hash do nosso script anti-flash, calculado da MESMA constante que o layout
 * renderiza — editar o script atualiza o hash sozinho.
 *
 * Por que hash e não nonce para ESTE script, se os do Next usam nonce: o
 * navegador apaga o atributo `nonce` do DOM (medida do próprio padrão, para o
 * nonce não vazar via seletor de CSS). O React então compara o `nonce` que o
 * servidor mandou com o `""` que sobra no cliente e acusa mismatch de
 * hidratação. Com hash, o atributo nem existe e o problema some.
 *
 * Web Crypto (não `node:crypto`): isto roda no runtime Edge.
 */
let hashAntiFlash: string | null = null;

async function obterHashAntiFlash(): Promise<string> {
  if (hashAntiFlash) return hashAntiFlash;

  const bytes = new TextEncoder().encode(SIDEBAR_ANTI_FLASH_SCRIPT);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));

  hashAntiFlash = `'sha256-${base64}'`;
  return hashAntiFlash;
}

function montarCSP(nonce: string, hashScriptProprio: string): string {
  const desenvolvimento = process.env.NODE_ENV !== 'production';

  return [
    `default-src 'self'`,
    // `strict-dynamic`: scripts carregados pelo bundle nonceado herdam a
    // confiança, o que é como o Next carrega seus chunks. `unsafe-eval` só em
    // dev (React Refresh precisa); o build de produção roda sem.
    `script-src 'self' 'nonce-${nonce}' ${hashScriptProprio} 'strict-dynamic'${desenvolvimento ? " 'unsafe-eval'" : ''}`,
    // `unsafe-inline` em ESTILO é risco baixo e necessário: Tailwind e React
    // injetam style inline. Não abre execução de script.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // A IA fala SERVIDOR → OpenAI, nunca do browser. Então `'self'` basta e
    // funciona como trava real: script injetado na página não consegue mandar
    // dado financeiro para host nenhum. Em dev o websocket do HMR é same-origin.
    `connect-src 'self'${desenvolvimento ? ' ws: wss:' : ''}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const nonce = btoa(crypto.randomUUID());
  const csp = montarCSP(nonce, await obterHashAntiFlash());

  const cabecalhos = new Headers(req.headers);
  // O layout precisa saber a rota para decidir se pode exigir login sem
  // criar um laço de redirecionamento em /login.
  cabecalhos.set('x-pathname', pathname);
  // O header de CSP na REQUISIÇÃO é o que o Next lê para noncear os scripts
  // dele. Nosso script anti-flash não usa nonce (usa hash — ver acima).
  cabecalhos.set('Content-Security-Policy', csp);

  const publica = ROTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const temCookie = req.cookies.has(COOKIE_SESSAO);

  if (!publica && !temCookie) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set('Content-Security-Policy', csp);
  return resposta;
}

export const config = {
  /**
   * Tudo, exceto assets estáticos. `/api/backup` É incluído de propósito: ele
   * ainda faz a sua própria checagem de OWNER (a defesa real), mas não há
   * motivo para deixá-lo passar sem cookie.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
