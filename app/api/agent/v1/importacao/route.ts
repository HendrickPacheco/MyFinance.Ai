import { ErroApi, rotaEscrita } from '@/agent-api';
import { criarImportacaoBodySchema, type CriarImportacaoBody } from '@/agent-api/schemas/importacao-admin';
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

/** Conjunto de caracteres válido de base64 (padrão ou URL-safe, com ou sem padding). */
const BASE64_VALIDO = /^[A-Za-z0-9+/_-]+={0,2}$/;

function decodificarPdfBase64(pdfBase64: string): Uint8Array {
  const semEspacos = pdfBase64.trim();
  if (semEspacos.length === 0 || !BASE64_VALIDO.test(semEspacos)) {
    throw new ErroApi(400, 'PDF_BASE64_INVALIDO', 'Campo "pdfBase64" não é base64 válido.');
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(semEspacos, 'base64');
  } catch {
    throw new ErroApi(400, 'PDF_BASE64_INVALIDO', 'Campo "pdfBase64" não é base64 válido.');
  }

  if (bytes.length === 0) {
    throw new ErroApi(400, 'PDF_BASE64_INVALIDO', 'Campo "pdfBase64" decodificou para um arquivo vazio.');
  }
  if (bytes.length > TAMANHO_MAXIMO_BYTES) {
    throw new ErroApi(413, 'ARQUIVO_GRANDE_DEMAIS', 'PDF decodificado excede o tamanho máximo permitido.');
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Traduz os erros nomeados de `textoDePdf` para `ErroApi` (422 — regra de negócio sobre o arquivo), sem vazar stack. */
async function extrairTextoDoPdf(pdfBase64: string): Promise<string> {
  const bytes = decodificarPdfBase64(pdfBase64);
  try {
    const { texto } = await textoDePdf(bytes);
    return texto;
  } catch (erro) {
    if (
      erro instanceof PdfSemTextoError ||
      erro instanceof PdfExcedeLimiteDePaginasError ||
      erro instanceof PdfInvalidoError
    ) {
      throw new ErroApi(422, 'PDF_INVALIDO', erro.message);
    }
    throw erro;
  }
}

async function textoDaEntrada(body: CriarImportacaoBody): Promise<string> {
  if ('texto' in body) return body.texto;
  return extrairTextoDoPdf(body.pdfBase64);
}

/**
 * Mesmo fluxo de `app/api/importacao/route.ts` + `colarTextoImportacaoAction`:
 * extrai o texto (texto colado direto, ou de um PDF em base64), normaliza,
 * calcula o hash de idempotência e concilia. `conciliarImportacao` já
 * lança `ExtracaoIAIndisponivelError` (-> 422, mapeado pelo kernel) quando
 * `deps.ia` está indisponível nesta instalação.
 */
export const POST = rotaEscrita(
  {
    escopo: 'write',
    body: criarImportacaoBodySchema,
    entidade: 'Importacao',
    acao: 'CREATE',
    status: 201,
  },
  async ({ deps, body, auditar }) => {
    const texto = await textoDaEntrada(body);
    const textoNormalizado = normalizarTextoDeFatura(texto);
    const hashConteudo = hashDoTexto(textoNormalizado);
    const nomeArquivo = 'pdfBase64' in body ? body.nomeArquivo ?? null : null;

    const resultado = await conciliarImportacao(deps, {
      texto: textoNormalizado,
      hashConteudo,
      competenciaRef: body.competenciaRef,
      origem: 'pdfBase64' in body ? 'PDF' : 'TEXTO_COLADO',
      nomeArquivo,
    });

    auditar({ entidadeId: resultado.importacaoId, depois: resultado });

    return { importacao: resultado };
  },
);
