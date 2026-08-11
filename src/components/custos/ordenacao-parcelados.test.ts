/**
 * Ordem de exibição de `/custos/parcelados` (TASKS-CUSTOS §3.2). É
 * apresentação, não regra financeira — mas a ordenação DEFAULT é contrato:
 * a tela responde "quando a verba respira", e ela se lê de cima para baixo.
 */
import { describe, it, expect } from 'vitest';
import {
  ORDENACAO_PADRAO,
  ordenarParcelamentos,
  type OrdenacaoParcelados,
} from './ordenacao-parcelados';
import type { LinhaParcelamentoGestao } from '@/application/parcelados-view';
import type { DataCivil } from '@/shared/data';

function linha(
  descricao: string,
  terminaEm: DataCivil | null,
  patch: { valorMensalCents?: number; valorRestanteCents?: number } = {},
): LinhaParcelamentoGestao {
  return {
    categoriaNome: 'Casa',
    resumo: {
      id: descricao,
      descricao,
      valorTotalCents: 100_000,
      numParcelas: 12,
      dataCompra: '2026-01-05',
      categoriaId: 'cat-var',
      encerradoEm: null,
      terminaEm,
      parcelasPagas: 0,
      parcelasTotal: 12,
      valorRestanteCents: patch.valorRestanteCents ?? 0,
      parcelasEmCicloFechado: 0,
      valorMensalCents: patch.valorMensalCents ?? 0,
      parcelaCorrente: 1,
      acabaNoProximoCiclo: false,
      metodoAtual: null,
      parcelas: [],
    },
  };
}

describe('ordenarParcelamentos', () => {
  it('o default é terminaEm crescente — quem acaba antes vem primeiro', () => {
    const linhas = [
      linha('Longa', '2027-06-05'),
      linha('Curta', '2026-09-05'),
      linha('Média', '2026-12-05'),
    ];

    expect(ORDENACAO_PADRAO).toEqual({ coluna: 'termina', direcao: 'asc' });
    expect(ordenarParcelamentos(linhas, ORDENACAO_PADRAO).map((l) => l.resumo.descricao)).toEqual([
      'Curta',
      'Média',
      'Longa',
    ]);
  });

  it('compra sem fim previsto vai para o fim nos DOIS sentidos', () => {
    // Inventar uma data para `terminaEm: null` faria uma compra sem parcela
    // viva parecer a próxima a acabar — ou a mais distante. Nenhuma das duas
    // é verdade: ela não tem fim a anunciar.
    const linhas = [linha('Sem fim', null), linha('Com fim', '2026-09-05')];

    const asc: OrdenacaoParcelados = { coluna: 'termina', direcao: 'asc' };
    const desc: OrdenacaoParcelados = { coluna: 'termina', direcao: 'desc' };

    expect(ordenarParcelamentos(linhas, asc).map((l) => l.resumo.descricao)).toEqual([
      'Com fim',
      'Sem fim',
    ]);
    expect(ordenarParcelamentos(linhas, desc).map((l) => l.resumo.descricao)).toEqual([
      'Com fim',
      'Sem fim',
    ]);
  });

  it('ordena por valor/mês e por resta sem tocar na lista original', () => {
    const linhas = [
      linha('A', '2026-09-05', { valorMensalCents: 10_000, valorRestanteCents: 30_000 }),
      linha('B', '2026-10-05', { valorMensalCents: 50_000, valorRestanteCents: 10_000 }),
    ];

    expect(
      ordenarParcelamentos(linhas, { coluna: 'valorMensal', direcao: 'desc' }).map(
        (l) => l.resumo.descricao,
      ),
    ).toEqual(['B', 'A']);
    expect(
      ordenarParcelamentos(linhas, { coluna: 'resta', direcao: 'asc' }).map(
        (l) => l.resumo.descricao,
      ),
    ).toEqual(['B', 'A']);
    // Imutabilidade: a lista de props do React nunca é reordenada in place.
    expect(linhas.map((l) => l.resumo.descricao)).toEqual(['A', 'B']);
  });
});
