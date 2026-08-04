import { NextResponse } from 'next/server';
import { criarDeps, prisma } from '@/composition';
import { exportarTudo, importarTudo } from '@/infrastructure/backup';
import { ehOwner } from '@/domain/auth/permissoes';

export const dynamic = 'force-dynamic';

/**
 * Esta rota é a mais perigosa do app: o GET entrega TODO o estado financeiro e
 * o POST apaga e reescreve o banco inteiro. Ela é um Route Handler comum, então
 * NÃO herda a proteção de origem que o Next dá às Server Actions — por isso a
 * checagem de CSRF é explícita aqui embaixo.
 */

/** Teto do corpo do import. Um backup real do dono tem ~30 KB. */
const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

/** 401 sem sessão, 403 com sessão sem poder. Distinguir ajuda o cliente a saber se deve relogar. */
async function exigirOwnerNaRota(): Promise<{ erro: Response } | { donoId: string }> {
  const deps = await criarDeps();
  if (deps.ator.id === '') {
    return { erro: NextResponse.json({ ok: false, erro: 'Não autenticado.' }, { status: 401 }) };
  }
  if (!ehOwner(deps.ator)) {
    return {
      erro: NextResponse.json(
        { ok: false, erro: 'Somente o dono pode acessar o backup.' },
        { status: 403 },
      ),
    };
  }
  // O backup é DO DONO AUTENTICADO — nunca do banco inteiro (multi-tenant).
  return { donoId: deps.ator.id };
}

/**
 * Defesa CSRF explícita. `Sec-Fetch-Site` é o sinal moderno (mandado pelo
 * próprio navegador, não forjável por script); `Origin` é o fallback. Um POST
 * disparado por outro site cai em `cross-site` e é recusado antes de qualquer
 * escrita.
 */
function origemSuspeita(req: Request): boolean {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite !== 'same-origin' && fetchSite !== 'none';

  const origin = req.headers.get('origin');
  if (!origin) return false; // cliente sem Origin (curl local); a sessão OWNER já barra o resto
  try {
    return new URL(origin).host !== new URL(req.url).host;
  } catch {
    return true;
  }
}

/** GET → exporta o estado completo como JSON para download. Só OWNER. */
export async function GET(): Promise<Response> {
  const acesso = await exigirOwnerNaRota();
  if ('erro' in acesso) return acesso.erro;

  const dump = await exportarTudo(prisma, acesso.donoId);
  const carimbo = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="financeiro-backup-${carimbo}.json"`,
      // Um dump financeiro nunca deve ficar em cache de proxy ou de disco.
      'Cache-Control': 'no-store, private',
    },
  });
}

/** POST → importa um JSON de backup (grava salvaguarda em ./data antes de sobrescrever). Só OWNER. */
export async function POST(req: Request): Promise<Response> {
  const acesso = await exigirOwnerNaRota();
  if ('erro' in acesso) return acesso.erro;

  if (origemSuspeita(req)) {
    return NextResponse.json({ ok: false, erro: 'Origem não permitida.' }, { status: 403 });
  }

  // Teto de tamanho ANTES de `req.json()`: parsear 500 MB para depois recusar
  // já teria custado a memória.
  const tamanho = Number(req.headers.get('content-length') ?? '0');
  if (tamanho > TAMANHO_MAXIMO_BYTES) {
    return NextResponse.json(
      { ok: false, erro: 'Arquivo de backup grande demais.' },
      { status: 413 },
    );
  }

  try {
    const payload = await req.json();
    const r = await importarTudo(prisma, payload, acesso.donoId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Falha ao importar.';
    return NextResponse.json({ ok: false, erro }, { status: 400 });
  }
}
