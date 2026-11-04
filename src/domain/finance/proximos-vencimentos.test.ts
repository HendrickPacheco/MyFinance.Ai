import { describe, it, expect } from 'vitest';
import { proximosVencimentos } from './proximos-vencimentos';

const fixo = (id: string, data: string, pago = false) => ({ id, nome: id, data, valorCents: 100, pago });

describe('proximosVencimentos', () => {
  it('filtra pago e fora da janela [hoje, hoje+6], ordena por data e nome', () => {
    const itens = proximosVencimentos({
      hoje: '2026-11-04',
      dias: 7,
      fixos: [
        fixo('Ontem', '2026-11-03'),
        fixo('Aluguel', '2026-11-09'),
        fixo('Condominio', '2026-11-09'),
        fixo('Pago', '2026-11-05', true),
        fixo('Hoje', '2026-11-04'),
        fixo('Fora', '2026-11-11'),
        fixo('Limite', '2026-11-10'),
      ],
      parcelas: [
        { id: 'tx-1', nome: 'Carro', data: '2026-11-08', valorCents: 70_183, pago: false, parcelaAtual: 3, numParcelas: 5 },
        { id: 'tx-2', nome: 'Paga', data: '2026-11-08', valorCents: 1, pago: true, parcelaAtual: 1, numParcelas: 2 },
      ],
    });

    expect(itens.map((i) => i.id)).toEqual(['Hoje', 'tx-1', 'Aluguel', 'Condominio', 'Limite']);
    expect(itens[0]).toMatchObject({ tipo: 'FIXO', rotuloData: '04/11' });
    expect(itens[1]).toMatchObject({ tipo: 'PARCELA', rotuloData: '08/11 · parcela 3/5', valorCents: 70_183 });
  });
});
