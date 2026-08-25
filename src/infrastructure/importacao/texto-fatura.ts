/**
 * Conversão do documento anexado (PDF nativo) em texto, e identidade do
 * documento por hash — infraestrutura pura de I/O, sem tocar disco.
 *
 * Guarda inviolável (TASKS-IMPORTACAO.md §15.6, guarda 1): os bytes do
 * documento NUNCA são persistidos — nem em `./data/`, reservado ao snapshot
 * de salvaguarda do backup. Este arquivo recebe bytes em memória e devolve
 * texto; zero `fs`, zero escrita em disco, em nenhuma função abaixo.
 *
 * PDF nativo apenas (TASKS-IMPORTACAO.md §5): PDF escaneado, imagem, OCR e
 * Word/.docx estão fora da v1, permanentemente para .docx. Um PDF sem
 * camada de texto lança `PdfSemTextoError` — nunca é tratado em silêncio
 * como texto vazio, e nunca é enviado a OCR.
 */
import { createHash } from 'node:crypto';
import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Teto de tamanho do documento anexado, em bytes.
 *
 * 15 MiB cobre com folga uma fatura de cartão de várias páginas (as reais
 * observadas ficam na casa de 1–3 MiB); acima disso o mais provável é PDF
 * escaneado com imagens de alta resolução — fora da v1 de qualquer forma,
 * então rejeitar cedo poupa o custo de abrir o parser.
 */
export const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

/**
 * Teto de páginas do PDF aceito.
 *
 * Fatura de cartão real tem 2–8 páginas; 30 dá margem generosa para faturas
 * com muitos lançamentos parcelados sem abrir a porta para um PDF de outra
 * natureza (extrato anual, por exemplo) entrar pelo caminho errado.
 */
export const PAGINAS_MAXIMAS = 30;

/**
 * Abaixo deste número de caracteres não-vazios, o texto extraído é tratado
 * como "PDF sem camada de texto" — provavelmente escaneado. Um valor baixo
 * porque o objetivo não é validar conteúdo, só distinguir "não há texto" de
 * "há pouco texto por PDF curto".
 */
const CARACTERES_MINIMOS_TEXTO_VALIDO = 20;

/** PDF sem camada de texto (provável digitalização) — fora da v1. */
export class PdfSemTextoError extends Error {
  constructor() {
    super(
      'Este PDF parece ser digitalizado (sem texto selecionável). ' +
        'Importação de PDF escaneado não é suportada — copie o texto da fatura e cole no campo de texto.',
    );
    this.name = 'PdfSemTextoError';
  }
}

/** PDF corrompido, protegido por senha, ou ilegível pelo parser. */
export class PdfInvalidoError extends Error {
  constructor(cause: unknown) {
    super('Não foi possível ler este PDF — o arquivo pode estar corrompido ou protegido por senha.');
    this.name = 'PdfInvalidoError';
    this.cause = cause;
  }
}

/** PDF com mais páginas do que `PAGINAS_MAXIMAS`. */
export class PdfExcedeLimiteDePaginasError extends Error {
  constructor(paginas: number) {
    super(`Este PDF tem ${paginas} páginas — o máximo aceito é ${PAGINAS_MAXIMAS}.`);
    this.name = 'PdfExcedeLimiteDePaginasError';
  }
}

/**
 * Normaliza o texto cru para virar entrada estável da extração e do hash.
 *
 * Colapsa espaços/tabs repetidos, normaliza quebras de linha (`\r\n` →
 * `\n`), remove linhas vazias repetidas e aplica `trim` por linha. Nunca
 * altera dígitos, pontuação de valores monetários (ex.: "1.234,56") ou
 * acentos — o texto ainda será lido por um extrator, e mexer em número aqui
 * seria corromper dinheiro em silêncio.
 *
 * Estável por construção: normalizar o resultado de novo devolve o mesmo
 * texto, e dois documentos idênticos a menos de estilo de quebra de linha
 * ou espaçamento produzem a mesma saída — condição necessária para que
 * `hashDoTexto` sirva de chave de idempotência.
 */
export function normalizarTextoDeFatura(bruto: string): string {
  const linhas = bruto
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((linha) => linha.replace(/[ \t]+/g, ' ').trim());

  const semLinhasVaziasRepetidas: string[] = [];
  for (const linha of linhas) {
    const anterior = semLinhasVaziasRepetidas[semLinhasVaziasRepetidas.length - 1];
    if (linha === '' && anterior === '') continue;
    semLinhasVaziasRepetidas.push(linha);
  }

  return semLinhasVaziasRepetidas.join('\n').trim();
}

/**
 * sha256 do texto NORMALIZADO — identidade do documento (§11, camada 1).
 *
 * Determinístico: o mesmo texto normalizado sempre produz o mesmo hash, o
 * que é a base de `Importacao @@unique([donoId, hashConteudo])` — reenviar
 * o mesmo documento não re-extrai.
 */
export function hashDoTexto(textoNormalizado: string): string {
  return createHash('sha256').update(textoNormalizado, 'utf8').digest('hex');
}

/**
 * Extrai o texto de um PDF NATIVO, localmente, via `unpdf`.
 *
 * Recebe os bytes em memória e devolve texto — nunca grava os bytes em
 * disco, em nenhuma hipótese (guarda §15.6). O chamador (rota HTTP) é
 * responsável por aplicar `TAMANHO_MAXIMO_BYTES` antes de chamar esta
 * função; aqui só `PAGINAS_MAXIMAS` é verificado, porque a contagem de
 * páginas só existe depois de abrir o documento.
 *
 * @throws {PdfInvalidoError} se o parser não conseguir abrir o documento.
 * @throws {PdfExcedeLimiteDePaginasError} se o PDF tiver mais páginas que `PAGINAS_MAXIMAS`.
 * @throws {PdfSemTextoError} se o PDF não tiver camada de texto (provável digitalização).
 */
export async function textoDePdf(bytes: Uint8Array): Promise<{ texto: string; paginas: number }> {
  const documento = await abrirDocumentoPdf(bytes);

  if (documento.numPages > PAGINAS_MAXIMAS) {
    throw new PdfExcedeLimiteDePaginasError(documento.numPages);
  }

  const { text, totalPages } = await extrairTextoBruto(documento);

  if (text.replace(/\s/g, '').length < CARACTERES_MINIMOS_TEXTO_VALIDO) {
    throw new PdfSemTextoError();
  }

  return { texto: text, paginas: totalPages };
}

async function abrirDocumentoPdf(bytes: Uint8Array): Promise<Awaited<ReturnType<typeof getDocumentProxy>>> {
  try {
    return await getDocumentProxy(bytes);
  } catch (erro) {
    if (erro instanceof PdfExcedeLimiteDePaginasError || erro instanceof PdfSemTextoError) throw erro;
    throw new PdfInvalidoError(erro);
  }
}

async function extrairTextoBruto(
  documento: Awaited<ReturnType<typeof getDocumentProxy>>,
): Promise<{ text: string; totalPages: number }> {
  try {
    const resultado = await extractText(documento, { mergePages: true });
    return { text: resultado.text, totalPages: resultado.totalPages };
  } catch (erro) {
    throw new PdfInvalidoError(erro);
  }
}
