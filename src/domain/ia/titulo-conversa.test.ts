/**
 * Testes de `derivarTituloConversa` (Fase 2 da persistência de conversas).
 * Função pura, sem I/O — cobre colapso de espaço, truncamento e fallback.
 */
import { describe, expect, it } from 'vitest';
import { TITULO_CONVERSA_PADRAO, derivarTituloConversa } from './titulo-conversa';

describe('derivarTituloConversa', () => {
  it('usa a pergunta como título quando ela cabe no limite', () => {
    expect(derivarTituloConversa('Quanto posso gastar hoje?')).toBe('Quanto posso gastar hoje?');
  });

  it('remove espaço nas pontas', () => {
    expect(derivarTituloConversa('   quanto sobra no mês?   ')).toBe('quanto sobra no mês?');
  });

  it('colapsa quebras de linha e espaços repetidos num único espaço', () => {
    expect(derivarTituloConversa('quanto   eu\n\ngasto   por dia?')).toBe('quanto eu gasto por dia?');
  });

  it('trunca em 60 caracteres com reticências', () => {
    const pergunta =
      'Eu queria entender exatamente quanto ainda posso gastar hoje sem comprometer a minha meta de poupança deste mês';
    const titulo = derivarTituloConversa(pergunta);

    expect(titulo).toBe(`${pergunta.slice(0, 60)}…`);
    expect(titulo.length).toBe(61);
    expect(pergunta.startsWith(titulo.slice(0, -1))).toBe(true);
  });

  it('não corta uma pergunta com exatamente 60 caracteres', () => {
    const pergunta = 'a'.repeat(60);
    expect(derivarTituloConversa(pergunta)).toBe(pergunta);
  });

  it('cai para o título padrão quando a pergunta é vazia', () => {
    expect(derivarTituloConversa('')).toBe(TITULO_CONVERSA_PADRAO);
  });

  it('cai para o título padrão quando a pergunta é só espaço', () => {
    expect(derivarTituloConversa('   \n\t  ')).toBe(TITULO_CONVERSA_PADRAO);
  });
});
