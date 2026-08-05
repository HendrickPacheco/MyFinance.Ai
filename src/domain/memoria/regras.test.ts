/**
 * Testes da guarda da memória (Fase E, §11.2).
 *
 * O que estes testes protegem: a única defesa contra número velho virar
 * "verdade" dentro de um embedding. Se algum caso de rejeição aqui passar a
 * falhar, a memória deixou de ser segura — não relaxe o teste, conserte a
 * regra.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_CARACTERES_MEMORIA,
  contemValorMonetario,
  ehTipoMemoria,
  normalizarTextoMemoria,
  validarTextoMemoria,
} from './regras';

describe('contemValorMonetario', () => {
  it.each([
    'quero juntar R$ 50.000,00 até dezembro',
    'minha verba é R$ 7.116,00',
    'guardei R$50 essa semana',
    'quero juntar 50 mil reais',
    'gastei 3000 reais no mês',
    'a meta é 2 milhões de reais',
    'quero juntar 50k',
    'consigo separar 1.234,56 por mês',
    'o almoço sai 47,90',
    'preciso de 50000 na reserva',
    'BRL 300 por mês',
  ])('rejeita dinheiro disfarçado: %s', (texto) => {
    expect(contemValorMonetario(texto)).toBe(true);
  });

  it.each([
    'quero trocar de carro em 2027',
    'meu objetivo é sair do aluguel até 2028',
    'não gosto de parcelar em mais de 6 vezes',
    'trabalho como desenvolvedor e recebo por mês',
    'quero formar uma reserva de emergência',
    'corto lazer antes de cortar alimentação',
    'tenho 2 filhos',
    'pretendo me mudar daqui a 3 meses',
  ])('deixa passar intenção sem valor: %s', (texto) => {
    expect(contemValorMonetario(texto)).toBe(false);
  });

  it('trata ano fora da janela plausível como valor', () => {
    // 1899 e 2101 não são ano de plano de vida — são número grande solto.
    expect(contemValorMonetario('meta de 1899')).toBe(true);
    expect(contemValorMonetario('meta de 2101')).toBe(true);
    expect(contemValorMonetario('meta para 1900')).toBe(false);
    expect(contemValorMonetario('meta para 2100')).toBe(false);
  });
});

describe('normalizarTextoMemoria', () => {
  it('colapsa espaço, quebra de linha e tab', () => {
    expect(normalizarTextoMemoria('  quero   sair\n\tdo aluguel  ')).toBe('quero sair do aluguel');
  });

  it('preserva acento e caixa', () => {
    expect(normalizarTextoMemoria('Quero Formar uma Reserva de Emergência')).toBe(
      'Quero Formar uma Reserva de Emergência',
    );
  });
});

describe('validarTextoMemoria', () => {
  it('aceita e devolve o texto normalizado', () => {
    const r = validarTextoMemoria('  quero  sair do aluguel até 2028 ');
    expect(r).toEqual({ ok: true, texto: 'quero sair do aluguel até 2028' });
  });

  it('rejeita texto com valor monetário e explica o porquê', () => {
    const r = validarTextoMemoria('quero juntar R$ 50.000,00');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/valor em dinheiro/i);
    // A mensagem precisa ensinar o caminho certo, não só negar.
    expect(r.motivo).toMatch(/intenção/i);
  });

  it('rejeita texto curto demais', () => {
    const r = validarTextoMemoria('oi');
    expect(r.ok).toBe(false);
  });

  it('rejeita texto longo demais', () => {
    const r = validarTextoMemoria('a'.repeat(MAX_CARACTERES_MEMORIA + 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/longa demais/i);
  });

  it('mede o tamanho DEPOIS de normalizar', () => {
    // Só passa do teto por causa de espaço repetido — normalizar resolve.
    const comEspacos = 'quero sair do aluguel' + '  '.repeat(MAX_CARACTERES_MEMORIA);
    expect(validarTextoMemoria(comEspacos).ok).toBe(true);
  });
});

describe('ehTipoMemoria', () => {
  it('aceita os quatro tipos e recusa o resto', () => {
    expect(ehTipoMemoria('PLANO')).toBe(true);
    expect(ehTipoMemoria('CONVERSA')).toBe(true);
    expect(ehTipoMemoria('VERBA')).toBe(false);
    expect(ehTipoMemoria('plano')).toBe(false);
  });
});
