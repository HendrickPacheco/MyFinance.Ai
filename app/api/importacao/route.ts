import { NextResponse } from 'next/server';
import { criarDeps } from '@/composition';
import { ehOwner } from '@/domain/auth/permissoes';
import {
  PdfExcedeLimiteDePaginasError,
  PdfInvalidoError,
  PdfSemTextoError,
  TAMANHO_MAXIMO_BYTES,
  hashDoTexto,
  normalizarTextoDeFatura,
  textoDePdf,
} from '@/infrastructure/importacao/texto-fatura';
import { conciliarImportacao } from '@/application/importacao/conciliar';

export const dynamic = 'force-dynamic';

/**
 * Porta de entrada do PDF de fatura (I3, onda 3 — `TASKS-IMPORTACAO.md`).
 *
 * É um Route Handler, e não uma server action, só por causa do §3.2 do
 * plano: `serverActions.bodySizeLimit` é uma configuração GLOBAL do Next —
 * subi-la para caber um PDF de fatura enfraqueceria o teto de toda outra
 * server action do app para beneficiar uma única rota. Aqui o teto é local
 * (`TAMANHO_MAXIMO_BYTES`, checado por `content-length` antes de ler o
 * corpo) e não vaza para o resto do app.
 *
 * Route Handler NÃO herda a proteção de origem que o Next dá às Server
 * Actions, então a checagem de CSRF é explícita aqui — mesmo padrão de
 * `app/api/backup/route.ts`.
 *
 * 🔴 Os bytes do PDF NUNCA tocam disco nesta rota — nem em `./data/`. Eles
 * vivem só em memória, viram texto via `textoDePdf` e são descartados. Zero
 * `fs` neste arquivo, em nenhuma hipótese (guarda §15.6).
 */

/** 401 sem sessão, 403 com sessão sem poder de OWNER — importação de fatura é OWNER-only (IA gasta dinheiro real, DA-3). */
async function exigirOwnerNaRota(): Promise<{ erro: Response } | { donoId: string }> {
  const deps = await criarDeps();
  if (deps.ator.id === '') {
    return { erro: NextResponse.json({ ok: false, erro: 'Não autenticado.' }, { status: 401 }) };
  }
  if (!ehOwner(deps.ator)) {
    return {
      erro: NextResponse.json(
        { ok: false, erro: 'Somente o dono pode importar faturas.' },
        { status: 403 },
      ),
    };
  }
  return { donoId: deps.ator.id };
}

/**
 * Defesa CSRF explícita — `Sec-Fetch-Site` é o sinal moderno (mandado pelo
 * próprio navegador, não forjável por script); `Origin` é o fallback. Um
 * POST disparado por outro site cai em `cross-site` e é recusado antes de
 * qualquer leitura de corpo.
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

const COMPETENCIA_REF_REGEX = /^\d{4}-\d{2}$/;

/** Traduz os erros nomeados de `textoDePdf` para status HTTP, sem vazar stack. */
function respostaDeErroDePdf(erro: unknown): Response | null {
  if (erro instanceof PdfSemTextoError) {
    return NextResponse.json({ ok: false, erro: erro.message }, { status: 422 });
  }
  if (erro instanceof PdfExcedeLimiteDePaginasError) {
    return NextResponse.json({ ok: false, erro: erro.message }, { status: 422 });
  }
  if (erro instanceof PdfInvalidoError) {
    return NextResponse.json({ ok: false, erro: erro.message }, { status: 422 });
  }
  return null;
}

/**
 * POST multipart/form-data — único formato que carrega o PDF (`arquivo`) e a
 * competência da fatura (`competenciaRef`, "YYYY-MM", informada pelo dono)
 * no mesmo corpo sem inventar um cabeçalho customizado.
 *
 * Campos:
 *  - `arquivo`: File — o PDF nativo da fatura.
 *  - `competenciaRef`: string — "YYYY-MM".
 *  - `nomeArquivo`: string opcional — se ausente, usa `arquivo.name`.
 *
 * Resposta: `{ ok: true, data: ResultadoImportacaoConciliada }` ou
 * `{ ok: false, erro: string }` com o status apropriado.
 */
export async function POST(req: Request): Promise<Response> {
  const acesso = await exigirOwnerNaRota();
  if ('erro' in acesso) return acesso.erro;

  if (origemSuspeita(req)) {
    return NextResponse.json({ ok: false, erro: 'Origem não permitida.' }, { status: 403 });
  }

  // Teto de tamanho ANTES de ler o corpo: parsear 15 MB+ de multipart para
  // depois recusar já teria custado a memória e o parse.
  const tamanho = Number(req.headers.get('content-length') ?? '0');
  if (tamanho > TAMANHO_MAXIMO_BYTES) {
    return NextResponse.json({ ok: false, erro: 'Arquivo de fatura grande demais.' }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, erro: 'Corpo da requisição não é multipart/form-data válido.' },
      { status: 400 },
    );
  }

  const arquivo = formData.get('arquivo');
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ ok: false, erro: 'Campo "arquivo" (PDF) é obrigatório.' }, { status: 400 });
  }
  // `content-length` cobre o corpo multipart inteiro (inclui boundary e os
  // outros campos); o arquivo em si também precisa respeitar o teto sozinho.
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return NextResponse.json({ ok: false, erro: 'Arquivo de fatura grande demais.' }, { status: 413 });
  }

  const competenciaRefBruta = formData.get('competenciaRef');
  if (typeof competenciaRefBruta !== 'string' || !COMPETENCIA_REF_REGEX.test(competenciaRefBruta)) {
    return NextResponse.json(
      { ok: false, erro: 'Campo "competenciaRef" precisa estar em YYYY-MM.' },
      { status: 400 },
    );
  }

  const nomeArquivoBruto = formData.get('nomeArquivo');
  const nomeArquivo = typeof nomeArquivoBruto === 'string' && nomeArquivoBruto.trim().length > 0
    ? nomeArquivoBruto.trim()
    : arquivo.name;

  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  let texto: string;
  try {
    const extraido = await textoDePdf(bytes);
    texto = extraido.texto;
  } catch (erro) {
    const respostaTraduzida = respostaDeErroDePdf(erro);
    if (respostaTraduzida) return respostaTraduzida;
    return NextResponse.json({ ok: false, erro: 'Falha ao ler o PDF.' }, { status: 400 });
  }

  const textoNormalizado = normalizarTextoDeFatura(texto);
  const hashConteudo = hashDoTexto(textoNormalizado);

  try {
    const deps = await criarDeps();
    const resultado = await conciliarImportacao(deps, {
      texto: textoNormalizado,
      hashConteudo,
      competenciaRef: competenciaRefBruta,
      origem: 'PDF',
      nomeArquivo,
    });
    return NextResponse.json({ ok: true, data: resultado });
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Falha ao conciliar a importação.';
    const status = e instanceof Error && e.name === 'AcessoNegadoError' ? 403 : 400;
    return NextResponse.json({ ok: false, erro }, { status });
  }
}
