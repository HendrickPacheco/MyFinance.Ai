import { describe, expect, it } from 'vitest';
import { AcessoNegadoError } from '@/domain/auth/permissoes';
import type { Categoria } from '@/domain/model/entidades';
import {
  ATOR_VIEWER,
  CATEGORIA_VARIAVEL,
  CONFIG_PADRAO,
  cicloFake,
  criarDeps,
  primeiro,
} from './__fakes__/fakes-ciclo-fechamento';
import { CicloFechadoError } from './retroatividade';
import { obterDestinoDaRendaSomenteLeitura } from './destino-da-renda';
import {
  confirmarRendaReal,
  previaConfirmacaoRendaReal,
  previaRecalculoRenda,
  recalcularRendaDoCiclo,
  RendaJaConfirmadaError,
} from './renda-ciclo';

const CATEGORIA_RENDA: Categoria = {
  ...CATEGORIA_VARIAVEL,
  id: 'cat-renda',
  nome: 'Salário',
  grupo: 'RENDA',
};

async function montar(opcoes: { fechado?: boolean; viewer?: boolean } = {}) {
  const deps = criarDeps({
    hoje: '2026-11-04',
    ator: opcoes.viewer ? ATOR_VIEWER : undefined,
    categorias: [CATEGORIA_VARIAVEL, CATEGORIA_RENDA],
    config: {
      ...CONFIG_PADRAO,
      rendaBaseCents: 3_000_000,
      diaRecebimento: 1,
      metaPoupancaCents: 1_800_000,
      pisoDiarioVerbaCents: 15_000,
      moedaRenda: 'USD',
      rendaBrutaMoedaOrigemCents: 730_000,
      impostoEstimadoCents: 350_000,
    },
    ciclos: [
      cicloFake({
        id: 'nov',
        dataInicio: '2026-11-01',
        dataFim: '2026-11-30',
        rendaPrevistaCents: 3_000_000,
        poupancaAlvoCents: 1_800_000,
        fixosCents: 488_400,
        verbaVariavelCents: 2_511_600,
        fechado: opcoes.fechado ?? false,
      }),
    ],
  });
  await deps.cotacoes.salvar({
    data: '2026-11-03',
    moedaOrigem: 'USD',
    moedaDestino: 'BRL',
    taxaMicros: 5_430_000,
    fonte: 'PTAX_BCB',
  });
  return deps;
}

const USD_REAL = {
  brutaOrigemCents: 730_000,
  taxaMicros: 5_500_000,
  impostoCents: 350_000,
  gerarLancamento: true,
};

const rendas = (deps: Awaited<ReturnType<typeof montar>>) =>
  deps.transacoes.itens.filter((t) => t.tipo === 'RENDA');

describe('recálculo da renda prevista do ciclo', () => {
  it('prévia mostra o impacto e não grava nada', async () => {
    const deps = await montar();
    const antes = structuredClone(deps.ciclos.itens);

    const p = await previaRecalculoRenda(deps);

    expect(p).toMatchObject({
      rendaAntesCents: 3_000_000,
      rendaDepoisCents: 3_613_900,
      verbaAntesCents: 2_511_600,
      verbaDepoisCents: 3_125_500,
      diaADiaDiarioDepoisCents: 15_000,
      extrasDepoisCents: 875_500,
      aviso: null,
    });
    expect(deps.ciclos.itens).toEqual(antes);
  });

  it('recalcular grava renda, verba e cotação prevista', async () => {
    const deps = await montar();

    const c = await recalcularRendaDoCiclo(deps);

    expect(c).toMatchObject({
      rendaPrevistaCents: 3_613_900,
      verbaVariavelCents: 3_125_500,
      cotacaoPrevistaMicros: 5_430_000,
      cotacaoPrevistaData: '2026-11-03',
    });
  });

  it('recusa quando a renda real já foi confirmada', async () => {
    const deps = await montar();
    await confirmarRendaReal(deps, 'nov', USD_REAL);

    await expect(recalcularRendaDoCiclo(deps)).rejects.toBeInstanceOf(RendaJaConfirmadaError);
  });
});

describe('confirmação da renda real', () => {
  it('grava a real, preserva a prevista e não duplica o lançamento ao re-confirmar', async () => {
    const deps = await montar();

    const c1 = await confirmarRendaReal(deps, 'nov', USD_REAL);
    expect(c1).toMatchObject({
      rendaRealLiquidaCents: 3_665_000,
      rendaRealBrutaMoedaOrigemCents: 730_000,
      cotacaoRealUsadaMicros: 5_500_000,
      impostoRealCents: 350_000,
      rendaPrevistaCents: 3_000_000,
      verbaVariavelCents: 3_176_600,
    });
    expect(rendas(deps)).toHaveLength(1);
    expect(primeiro(rendas(deps))).toMatchObject({
      valorCents: 3_665_000,
      data: '2026-11-04',
      categoriaId: 'cat-renda',
      contaId: null,
      cicloId: 'nov',
    });

    const c2 = await confirmarRendaReal(deps, 'nov', { ...USD_REAL, taxaMicros: 5_430_000 });
    expect(c2).toMatchObject({ rendaRealLiquidaCents: 3_613_900, verbaVariavelCents: 3_125_500 });
    expect(rendas(deps)).toHaveLength(1);
  });

  it('prévia da confirmação mostra o lançamento e não grava', async () => {
    const deps = await montar();

    const p = await previaConfirmacaoRendaReal(deps, 'nov', USD_REAL);

    expect(p).toMatchObject({
      rendaDepoisCents: 3_665_000,
      verbaDepoisCents: 3_176_600,
      lancamento: { valorCents: 3_665_000, data: '2026-11-04' },
    });
    expect(rendas(deps)).toHaveLength(0);
    expect(primeiro(deps.ciclos.itens).rendaRealLiquidaCents).toBeNull();
  });

  it('VIEWER não confirma', async () => {
    const deps = await montar({ viewer: true });
    await expect(confirmarRendaReal(deps, 'nov', USD_REAL)).rejects.toBeInstanceOf(
      AcessoNegadoError,
    );
  });

  it('ciclo fechado → CicloFechadoError', async () => {
    const deps = await montar({ fechado: true });
    await expect(confirmarRendaReal(deps, 'nov', USD_REAL)).rejects.toBeInstanceOf(
      CicloFechadoError,
    );
  });

  it('USD sem taxa → RangeError', async () => {
    const deps = await montar();
    const { taxaMicros: _t, ...semTaxa } = USD_REAL;
    await expect(confirmarRendaReal(deps, 'nov', semTaxa)).rejects.toBeInstanceOf(RangeError);
  });
});

describe('leitores usam a renda efetiva depois da confirmação (D8, D-15)', () => {
  it('"Para onde vai a renda" continua fechando: naoExplicadoCents === 0', async () => {
    const deps = await montar();
    const antes = await obterDestinoDaRendaSomenteLeitura(deps);
    expect(antes?.destino.naoExplicadoCents).toBe(0);

    await confirmarRendaReal(deps, 'nov', USD_REAL);

    const depois = await obterDestinoDaRendaSomenteLeitura(deps);
    expect(depois?.destino.naoExplicadoCents).toBe(0);
  });
});
