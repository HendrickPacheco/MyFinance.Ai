import { describe, expect, it } from 'vitest';
import { semMarkdown } from './texto';

describe('semMarkdown', () => {
  it('remove negrito com asterisco e underline', () => {
    expect(semMarkdown('Seu teto é **R$ 253,28** hoje.')).toBe('Seu teto é R$ 253,28 hoje.');
    expect(semMarkdown('Seu teto é __R$ 253,28__ hoje.')).toBe('Seu teto é R$ 253,28 hoje.');
  });

  it('remove itálico sem comer asterisco solto', () => {
    expect(semMarkdown('isso é *importante*.')).toBe('isso é importante.');
    expect(semMarkdown('use 3 * 4 para multiplicar')).toBe('use 3 * 4 para multiplicar');
  });

  it('preserva underline dentro de identificador', () => {
    expect(semMarkdown('Consultou situacao_hoje e estado_ciclo.')).toBe(
      'Consultou situacao_hoje e estado_ciclo.',
    );
  });

  it('remove crase e títulos', () => {
    expect(semMarkdown('chame `projetar_ciclos`')).toBe('chame projetar_ciclos');
    expect(semMarkdown('## Resumo\nTexto')).toBe('Resumo\nTexto');
  });

  it('converte marcador de lista em bullet legível', () => {
    expect(semMarkdown('- Mercado\n- Transporte')).toBe('• Mercado\n• Transporte');
  });

  it('não altera texto já limpo, inclusive valores em R$', () => {
    const texto = 'Sua verba livre é R$ 2.422,12, com R$ 4.693,88 comprometidos.';
    expect(semMarkdown(texto)).toBe(texto);
  });

  it('é idempotente', () => {
    const uma = semMarkdown('**R$ 10,00** e *nota*');
    expect(semMarkdown(uma)).toBe(uma);
  });
});
