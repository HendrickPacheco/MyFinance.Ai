/**
 * Testes dos schemas zod de `importacao-admin.ts` — sem Deps/banco, puro
 * zod. Cobre a "validação do lote de aprovação" pedida no brief: corpo
 * vazio é recusado, e um mesmo `itemId` não pode estar em `itens` e em
 * `descartar` ao mesmo tempo.
 */
import { describe, expect, it } from 'vitest';
import {
  aprovarImportacaoBodySchema,
  criarImportacaoBodySchema,
  desfazerImportacaoBodySchema,
} from './importacao-admin';

describe('aprovarImportacaoBodySchema', () => {
  it('aceita um lote só com itens para aprovar', () => {
    const resultado = aprovarImportacaoBodySchema.parse({ itens: [{ itemId: 'item-1' }] });
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.descartar).toEqual([]);
  });

  it('aceita um lote só com finalizar: true', () => {
    expect(() => aprovarImportacaoBodySchema.parse({ finalizar: true })).not.toThrow();
  });

  it('recusa um corpo vazio (nada para fazer)', () => {
    expect(() => aprovarImportacaoBodySchema.parse({})).toThrow();
  });

  it('recusa itemId presente em "itens" e em "descartar" ao mesmo tempo', () => {
    expect(() =>
      aprovarImportacaoBodySchema.parse({
        itens: [{ itemId: 'item-1' }],
        descartar: ['item-1'],
      }),
    ).toThrow();
  });

  it('aceita itens e descartar disjuntos no mesmo lote', () => {
    const resultado = aprovarImportacaoBodySchema.parse({
      itens: [{ itemId: 'item-1' }],
      descartar: ['item-2'],
    });
    expect(resultado.itens.map((i) => i.itemId)).toEqual(['item-1']);
    expect(resultado.descartar).toEqual(['item-2']);
  });
});

describe('criarImportacaoBodySchema', () => {
  it('aceita a forma de texto colado', () => {
    expect(() =>
      criarImportacaoBodySchema.parse({ texto: 'linha 1', competenciaRef: '2026-08' }),
    ).not.toThrow();
  });

  it('aceita a forma de PDF em base64', () => {
    expect(() =>
      criarImportacaoBodySchema.parse({ pdfBase64: 'QUJD', competenciaRef: '2026-08' }),
    ).not.toThrow();
  });

  it('recusa um corpo sem texto nem pdfBase64', () => {
    expect(() => criarImportacaoBodySchema.parse({ competenciaRef: '2026-08' })).toThrow();
  });

  it('recusa competenciaRef fora de YYYY-MM', () => {
    expect(() =>
      criarImportacaoBodySchema.parse({ texto: 'linha 1', competenciaRef: '2026/08' }),
    ).toThrow();
  });
});

describe('desfazerImportacaoBodySchema', () => {
  it('aceita corpo vazio (confirmarRetroativo é opcional)', () => {
    expect(() => desfazerImportacaoBodySchema.parse({})).not.toThrow();
  });
});
