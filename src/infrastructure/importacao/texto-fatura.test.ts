import { describe, expect, it } from 'vitest';
import {
  hashDoTexto,
  normalizarTextoDeFatura,
  PAGINAS_MAXIMAS,
  PdfInvalidoError,
  PdfSemTextoError,
  TAMANHO_MAXIMO_BYTES,
  textoDePdf,
} from './texto-fatura';

/**
 * Monta um PDF nativo mínimo, com uma página e uma linha de texto real
 * desenhada via operador `Tj`. Não usa nenhuma lib de geração — só a
 * sintaxe crua do formato — porque `unpdf`/`pdfjs-dist` são extratores, não
 * geradores. O xref é deliberadamente omitido: `pdfjs-dist` reconstrói a
 * tabela de objetos por varredura quando ela falta ou está quebrada, então
 * um PDF "cru" como este é aceito exatamente como um PDF real mal formado
 * seria.
 */
function montarPdfComTexto(texto: string): Uint8Array {
  const conteudo = `BT /F1 18 Tf 20 700 Td (${texto}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 612 792]/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${conteudo.length}>>
stream
${conteudo}
endstream
endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`;
  return new TextEncoder().encode(pdf);
}

/** PDF nativo sem nenhum operador de texto — simula digitalização. */
function montarPdfSemTexto(): Uint8Array {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/Resources<<>>/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 0>>
stream

endstream
endobj
trailer<</Root 1 0 R/Size 5>>
%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe('normalizarTextoDeFatura', () => {
  it('é idempotente', () => {
    const bruto = 'Mercado Livre   R$ 1.234,56\r\n\r\n\r\nPosto Shell  R$ 89,90\n';
    const umaVez = normalizarTextoDeFatura(bruto);
    const duasVezes = normalizarTextoDeFatura(umaVez);
    expect(duasVezes).toBe(umaVez);
  });

  it('\\r\\n e \\n produzem o mesmo hash', () => {
    const comCRLF = 'Mercado\r\nPosto Shell\r\nR$ 1.234,56';
    const comLF = 'Mercado\nPosto Shell\nR$ 1.234,56';
    expect(hashDoTexto(normalizarTextoDeFatura(comCRLF))).toBe(hashDoTexto(normalizarTextoDeFatura(comLF)));
  });

  it('colapsa espaços e tabs em excesso', () => {
    expect(normalizarTextoDeFatura('Mercado    Livre\t\tR$ 10,00')).toBe('Mercado Livre R$ 10,00');
  });

  it('remove linhas vazias repetidas, mantendo uma', () => {
    expect(normalizarTextoDeFatura('Linha 1\n\n\n\nLinha 2')).toBe('Linha 1\n\nLinha 2');
  });

  it('preserva valor monetário intacto, inclusive pontuação', () => {
    expect(normalizarTextoDeFatura('Total: 1.234,56')).toContain('1.234,56');
  });

  it('não altera dígitos nem acentos', () => {
    const texto = 'Compra em São Paulo, 12/03, R$ 1.234,56';
    expect(normalizarTextoDeFatura(texto)).toBe(texto);
  });
});

describe('hashDoTexto', () => {
  it('é determinístico', () => {
    expect(hashDoTexto('mesmo texto')).toBe(hashDoTexto('mesmo texto'));
  });

  it('textos diferentes dão hashes diferentes', () => {
    expect(hashDoTexto('texto A')).not.toBe(hashDoTexto('texto B'));
  });

  it('devolve hex de 64 caracteres', () => {
    const hash = hashDoTexto('qualquer coisa');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('textoDePdf', () => {
  it('extrai o texto de um PDF nativo com camada de texto', async () => {
    const bytes = montarPdfComTexto('MERCADO LIVRE SAO PAULO 1234 56');
    const { texto, paginas } = await textoDePdf(bytes);
    expect(texto).toContain('MERCADO LIVRE');
    expect(paginas).toBe(1);
  });

  it('lança PdfSemTextoError para PDF nativo sem camada de texto (digitalizado)', async () => {
    const bytes = montarPdfSemTexto();
    await expect(textoDePdf(bytes)).rejects.toBeInstanceOf(PdfSemTextoError);
  });

  it('a mensagem de PdfSemTextoError é legível e orienta a colar o texto', async () => {
    await expect(textoDePdf(montarPdfSemTexto())).rejects.toThrow(/cole no campo de texto/);
  });

  it('lança PdfInvalidoError para bytes que não são um PDF, preservando a causa', async () => {
    const bytes = new TextEncoder().encode('isto não é um PDF de jeito nenhum');
    try {
      await textoDePdf(bytes);
      expect.unreachable('deveria ter lançado PdfInvalidoError');
    } catch (erro) {
      expect(erro).toBeInstanceOf(PdfInvalidoError);
      expect((erro as PdfInvalidoError).cause).toBeDefined();
    }
  });
});

describe('tetos exportados', () => {
  it('TAMANHO_MAXIMO_BYTES e PAGINAS_MAXIMAS são positivos e finitos, para a rota validar upload', () => {
    expect(TAMANHO_MAXIMO_BYTES).toBeGreaterThan(0);
    expect(PAGINAS_MAXIMAS).toBeGreaterThan(0);
  });
});

describe('bytes do documento nunca tocam disco', () => {
  it('o módulo não importa nada de node:fs nem fs/promises', async () => {
    const codigoFonte = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./texto-fatura.ts', import.meta.url), 'utf8'),
    );
    expect(codigoFonte).not.toMatch(/from ['"]node:fs|from ['"]fs['"]/);
    expect(codigoFonte).not.toMatch(/writeFile|createWriteStream|fs\.write/);
  });
});
