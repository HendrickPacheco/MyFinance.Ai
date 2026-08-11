import { NextResponse } from 'next/server';
import { criarDeps } from '@/composition';
import { ConfigAusenteError } from '@/application/ciclos';
import {
  CSV_BOM_UTF8,
  obterResumoProjecao,
  serializarProjecaoCsv,
} from '@/application/projecao-view';
import { estaAutenticado } from '@/domain/auth/ator';
import { lerHorizonte } from '@/lib/projecao-horizonte';

export const dynamic = 'force-dynamic';

/**
 * Download do CSV da projeção (§3.4). Route Handler porque é um ARQUIVO, não
 * uma tela: `<a download>` num GET faz o navegador salvar sem uma linha de JS.
 *
 * QUATRO DETALHES QUE NÃO SÃO DECORAÇÃO:
 *
 * 1. O BOM. `CSV_BOM_UTF8` vem antes do conteúdo; sem ele o Excel no Windows
 *    abre "Provisão" como "ProvisÃ£o" e o dono conclui que o app está quebrado.
 *    A serialização é pura e não conhece o BOM — quem baixa é que prefixa.
 * 2. O MESMO CLAMP DA TELA. `lerHorizonte` é compartilhado com a page: o CSV de
 *    `?horizonte=999` tem que ser exatamente o que a tela mostra em 24 meses, e
 *    `projetarCiclos` lançaria `RangeError` (500) com o valor cru.
 * 3. ESCOPO DO DONO. `criarDeps()` constrói os repositórios já filtrados pelo
 *    `donoId` da sessão (regra de ouro do multi-tenant) — esta rota não monta
 *    query nenhuma, então não há como escapar do escopo aqui.
 * 4. SEM CACHE. É um extrato financeiro; nenhum proxy ou disco deve guardá-lo.
 *
 * Só GET, e GET não escreve: não há defesa CSRF a fazer (ao contrário de
 * `/api/backup`, cujo POST reescreve o banco).
 */
export async function GET(req: Request): Promise<Response> {
  const deps = await criarDeps();
  if (!estaAutenticado(deps.ator)) {
    return NextResponse.json({ ok: false, erro: 'Não autenticado.' }, { status: 401 });
  }

  const horizonte = lerHorizonte(new URL(req.url).searchParams.get('horizonte') ?? undefined);

  let resumo;
  try {
    resumo = await obterResumoProjecao(deps, { numCiclos: horizonte });
  } catch (erro) {
    if (!(erro instanceof ConfigAusenteError)) throw erro;
    return NextResponse.json(
      { ok: false, erro: 'Configure a renda e a meta antes de exportar a projeção.' },
      { status: 409 },
    );
  }

  const carimbo = new Date().toISOString().slice(0, 10);
  return new NextResponse(CSV_BOM_UTF8 + serializarProjecaoCsv(resumo.linhas), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="projecao-${String(horizonte)}-meses-${carimbo}.csv"`,
      'Cache-Control': 'no-store, private',
    },
  });
}
