import { CreditCard, GraduationCap, House, Receipt, ShoppingBag } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { iconeDaConta } from './icone-conta';

describe('iconeDaConta', () => {
  it('casa por palavra-chave ignorando acento e caixa', () => {
    expect(iconeDaConta('FACULDADE', 'FIXO')).toBe(GraduationCap);
    expect(iconeDaConta('Renner 3/10', 'PARCELA')).toBe(ShoppingBag);
    expect(iconeDaConta('Aluguel', 'FIXO')).toBe(House);
  });
  it('cai no ícone do tipo', () => {
    expect(iconeDaConta('Xyz', 'FIXO')).toBe(Receipt);
    expect(iconeDaConta('Xyz', 'PARCELA')).toBe(CreditCard);
  });
});
