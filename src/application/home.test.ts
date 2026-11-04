/**
 * Read-model da home (`obterEstadoHome`) contra fakes em memória.
 * Cenário: ciclo nov/2026 (01..30), hoje 04/11, piso R$ 15/dia (CONFIG_PADRAO).
 */
import { describe, it, expect, vi } from 'vitest';
import { obterEstadoHome } from './home';
import { criarDeps, cicloFake, contaFake, transacaoFake, CONFIG_PADRAO } from './__fakes__/fakes-ciclo-fechamento';
import type { CustoFixo, Parcelamento } from '@/domain/model/entidades';

const CICLO = cicloFake({
  id: 'ciclo-nov',
  dataInicio: '2026-11-01',
  dataFim: '2026-11-30',
  poupancaAlvoCents: 100_000,
  fixosCents: 237_000,
  verbaVariavelCents: 300_000,
});

const fixo = (id: string, nome: string, valorCents: number, diaVencimento: number): CustoFixo => ({
  id, nome, valorCents, diaVencimento,
  ativo: true, contaId: null, categoriaId: null, vigenteDe: null, vigenteAte: null,
});

const parcelamento = (id: string, descricao: string, numParcelas: number): Parcelamento => ({
  id, descricao, numParcelas,
  valorTotalCents: 0, dataCompra: '2026-09-08', categoriaId: null, encerradoEm: null,
});

function montarDeps() {
  return criarDeps({
    hoje: '2026-11-04',
    config: { ...CONFIG_PADRAO, diaRecebimento: 1 },
    ciclos: [CICLO],
    custosFixos: [
      fixo('f-aluguel', 'Aluguel', 200_000, 9),
      fixo('f-internet', 'Internet', 20_000, 3),
      fixo('f-faculdade', 'Faculdade', 17_000, 7),
    ],
    pagamentosFixos: [{ id: 'pg-1', custoFixoId: 'f-internet', cicloId: CICLO.id, pagoEm: '2026-11-03' }],
    parcelamentos: [parcelamento('p-note', 'Notebook', 3), parcelamento('p-cel', 'Celular', 5)],
    transacoes: [
      transacaoFake({ id: 'tx-mercado', data: '2026-11-02', valorCents: 15_000, cicloId: CICLO.id }),
      transacaoFake({ id: 'tx-note-3', data: '2026-11-08', valorCents: 30_000, parcelamentoId: 'p-note', parcelaNum: 3, cicloId: CICLO.id }),
      transacaoFake({ id: 'tx-cel-2', data: '2026-11-20', valorCents: 10_000, parcelamentoId: 'p-cel', parcelaNum: 2, cicloId: CICLO.id }),
    ],
    contas: [contaFake({ id: 'c-reserva', tipo: 'RESERVA', saldoCents: 6_000_000 })],
    usuarios: [{ id: 'u-owner', email: 'h@x.com', nome: 'Hendrick  Pacheco', senhaHash: null, papel: 'OWNER', ativo: true }],
  });
}

describe('obterEstadoHome', () => {
  it('hero e extras saem coerentes de divisaoDiaADia', async () => {
    const e = await obterEstadoHome(montarDeps());

    expect(e.cabecalho).toEqual({ mesNome: 'Novembro', diaDoCiclo: 4, diasTotais: 30, iniciais: 'HP' });
    // gastável = 300k − 100k (meta) − 40k (parcelas) = 160k; dia a dia = 15 × 30 = 45k.
    expect(e.hero).toMatchObject({
      gastavelCents: 160_000,
      diaADiaCents: 45_000,
      extrasCents: 115_000,
      usadoDiaADiaCents: 15_000,
      possoGastarHojeCents: Math.floor(30_000 / 27),
      diasRestantes: 27,
      progressoPercent: 33,
      emRecuperacao: false,
    });
    expect(e.extras).toEqual({ disponivelCents: 115_000, totalCents: 115_000, progressoPercent: 100 });
    expect(e.reserva).toMatchObject({ totalCents: 6_000_000, meses: null, metaMeses: 6, progressoPercent: 0 });
    expect(e.reserva.motivoSemDado).toBeTruthy();
  });

  it('gasto lançado hoje abate o hero por inteiro', async () => {
  const base = await obterEstadoHome(montarDeps());
  const e = await obterEstadoHome(
    criarDeps({
      hoje: '2026-11-04',
      config: { ...CONFIG_PADRAO, diaRecebimento: 1 },
      ciclos: [CICLO],
      transacoes: [
        transacaoFake({ id: 'tx-mercado', data: '2026-11-02', valorCents: 15_000, cicloId: CICLO.id }),
        transacaoFake({ id: 'tx-hoje', data: '2026-11-04', valorCents: 800, cicloId: CICLO.id }),
      ],
    }),
  );
  expect(e.hero.possoGastarHojeCents).toBe(Math.floor(30_000 / 27) - 800);
  expect(base.hero.possoGastarHojeCents).toBe(Math.floor(30_000 / 27));
});

it('próximos 7 dias filtra pago e fora da janela', async () => {
    const e = await obterEstadoHome(montarDeps());

    expect(e.proximos7Dias.total).toBe(3);
    expect(e.proximos7Dias.itens.map((i) => [i.tipo, i.id, i.rotuloData])).toEqual([
      ['FIXO', 'f-faculdade', '07/11'],
      ['PARCELA', 'tx-note-3', '08/11 · parcela 3/3'],
      ['FIXO', 'f-aluguel', '09/11'],
    ]);
  });

  it('despesas: somas, percentuais, maiores e parcelas terminando', async () => {
    const { despesas } = await obterEstadoHome(montarDeps());

    expect(despesas).toMatchObject({
      totalCents: 277_000,
      pagoCents: 20_000,
      aPagarCents: 257_000,
      fixoPercent: 86,
      parceladoPercent: 14,
    });
    expect(despesas.fixo).toMatchObject({ totalCents: 237_000, pagoCents: 20_000, qtd: 3, qtdPagas: 1, pagoPercent: 8, restantes: 0 });
    expect(despesas.fixo.maiores.map((m) => m.id)).toEqual(['f-aluguel', 'f-internet', 'f-faculdade']);
    expect(despesas.parcelado.maiores.map((m) => m.rotulo)).toEqual(['3/3 · última', '2/5']);
    expect(despesas.parcelado.terminamEsteMes).toEqual({ qtd: 1, valorCents: 30_000, mesSeguinte: 'dez' });
  });

  it('verba livre: 8 pontos rotulados e faixa de parcelas terminando', async () => {
    const { verbaLivre } = await obterEstadoHome(montarDeps());

    expect(verbaLivre.pontos).toHaveLength(8);
    expect(verbaLivre.pontos.slice(0, 2).map((p) => p.rotulo)).toEqual(['nov/26', 'dez']);
    expect(verbaLivre.ultimoMes).toBe('jun');
    expect(verbaLivre.ultimoCents).toBe(verbaLivre.pontos.at(-1)?.verbaLivreCents);
    expect(verbaLivre.faixaParcelasTerminando).toEqual({ inicioIdx: 0, fimIdx: 0 });
  });

  it('projeção e patrimônio quebrados degradam em vez de derrubar a home', async () => {
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = montarDeps();
    deps.parcelamentos.listar = () => Promise.reject(new Error('boom'));
    deps.patrimonio.ultimosSnapshots = () => Promise.reject(new Error('boom'));

    const e = await obterEstadoHome(deps);

    expect(e.verbaLivre).toEqual({ pontos: [], ultimoCents: 0, ultimoMes: '', faixaParcelasTerminando: null });
    expect(e.reserva).toMatchObject({ meses: null, totalCents: 0, motivoSemDado: expect.any(String) });
    silencio.mockRestore();
  });
});
