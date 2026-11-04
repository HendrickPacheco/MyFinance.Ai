import { describe, expect, it } from 'vitest';
import { interpretarLancamentoRapido as i } from './interpretar';

const cats = [
  { id: 'c1', nome: 'Mercado' },
  { id: 'c2', nome: 'Alimentação' },
  { id: 'c3', nome: 'Transporte' },
];

describe('interpretarLancamentoRapido', () => {
  it.each([
    ['80', 8000],
    ['80,50', 8050],
    ['80.50', 8050],
    ['1.234,56', 123456],
    ['R$ 80', 8000],
    ['R$80,5', 8050],
    ['1.234', 123400],
  ])('valor %s', (txt, cents) => {
    expect(i(txt, cats)).toMatchObject({ ok: true, valorCents: cents });
  });

  it('sem valor ou zero → erro', () => {
    expect(i('mercado', cats)).toEqual({ ok: false, erro: 'Informe um valor.' });
    expect(i('', cats)).toEqual({ ok: false, erro: 'Informe um valor.' });
    expect(i('0 mercado', cats)).toEqual({ ok: false, erro: 'Informe um valor.' });
  });

  it.each([
    ['credito', 'CREDITO'],
    ['Cartão', 'CREDITO'],
    ['DÉBITO', 'DEBITO'],
    ['pix', 'PIX'],
    ['dinheiro', 'DINHEIRO'],
    ['espécie', 'DINHEIRO'],
  ])('método %s', (kw, metodo) => {
    expect(i(`50 padaria ${kw}`, cats)).toMatchObject({ ok: true, metodo, descricao: 'padaria' });
  });

  it('sem método → null', () => {
    expect(i('50 padaria', cats)).toMatchObject({ metodo: null });
  });

  it('categoria por prefixo sem acento/caixa', () => {
    expect(i('120 mercado pix', cats)).toMatchObject({
      categoriaId: 'c1',
      descricao: 'mercado',
      metodo: 'PIX',
    });
    expect(i('30 alimentacao', cats)).toMatchObject({ categoriaId: 'c2' });
    expect(i('30 transp', cats)).toMatchObject({ categoriaId: 'c3' });
  });

  it('prefixo < 3 letras não casa; sem categoria → null', () => {
    expect(i('30 me', cats)).toMatchObject({ categoriaId: null, descricao: 'me' });
    expect(i('50 mercadorias', cats)).toMatchObject({ categoriaId: null }); // nome-prefixo-do-token não casa
    expect(i('30 cinema', cats)).toMatchObject({ categoriaId: null });
  });

  it('descrição vazia → null; valor em qualquer posição', () => {
    expect(i('80', cats)).toMatchObject({ descricao: null });
    expect(i('mercado 80 pix', cats)).toMatchObject({ valorCents: 8000, descricao: 'mercado' });
  });

  it.each(['extra', 'Extras', 'EXTRÁ'])('palavra %s → verba EXTRA, fora da descrição', (kw) => {
    expect(i(`200 presente ${kw} pix`, cats)).toMatchObject({
      ok: true,
      tipoVerba: 'EXTRA',
      descricao: 'presente',
      metodo: 'PIX',
    });
  });

  it('sem a palavra → tipoVerba null (vale o padrão da categoria); "extrato" não conta', () => {
    expect(i('50 mercado', cats)).toMatchObject({ tipoVerba: null });
    expect(i('50 extrato', cats)).toMatchObject({ tipoVerba: null, descricao: 'extrato' });
  });
});
