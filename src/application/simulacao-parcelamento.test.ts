import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/shared/dinheiro';
import { criarDeps, cicloFake, CONFIG_PADRAO } from './__fakes__/fakes-ciclo-fechamento';
import { simularImpactoParcelamento } from './simulacao-parcelamento';

function depsNov() {
  return criarDeps({
    hoje: '2026-11-10',
    config: { ...CONFIG_PADRAO, pisoDiarioVerbaCents: 15_000, diaRecebimento: 1 },
    ciclos: [
      cicloFake({
        id: 'nov',
        dataInicio: '2026-11-01',
        dataFim: '2026-11-30',
        rendaPrevistaCents: 3_000_000,
        fixosCents: 488_400,
        provisaoMensalCents: 0,
        verbaVariavelCents: 2_511_600,
        poupancaAlvoCents: 1_800_000,
      }),
    ],
  });
}

const compra = (valorTotalCents: number) => ({
  descricao: 'Notebook',
  valorTotalCents,
  numParcelas: 3,
  dataCompra: '2026-11-10',
});

describe('simularImpactoParcelamento', () => {
  it('compra grande reduz o dia a dia e gera alerta com o menor valor', async () => {
    const r = await simularImpactoParcelamento(depsNov(), compra(1_318_164));

    expect(r.meses).toHaveLength(3);
    expect(r.meses[0]).toMatchObject({
      inicio: '2026-11-01',
      parcelaCents: 439_388,
      extrasRestanteAntesCents: 261_600,
      diaADiaDiarioAntesCents: 15_000,
      diaADiaDiarioDepoisCents: 9_073,
    });
    // Dez/jan têm 31 dias (piso x dias maior): o MENOR dia a dia é R$ 84,06, não o de nov.
    expect(r.meses.map((m) => m.diaADiaDiarioDepoisCents)).toEqual([9_073, 8_406, 8_406]);
    expect(r.alerta).toBe(`Essa compra vai reduzir seu dia a dia para ${formatBRL(8_406)}/dia`);
  });

  it('compra pequena cabe nos extras: sem alerta', async () => {
    const r = await simularImpactoParcelamento(depsNov(), compra(300_000));

    expect(r.alerta).toBeNull();
  });

  it('dataCompra futura: primeira linha é o ciclo da compra e há numParcelas linhas', async () => {
    const r = await simularImpactoParcelamento(depsNov(), {
      ...compra(1_318_164),
      dataCompra: '2026-12-10',
    });

    expect(r.meses).toHaveLength(3);
    expect(r.meses[0]).toMatchObject({ inicio: '2026-12-01', parcelaCents: 439_388 });
    expect(r.meses.every((m) => m.parcelaCents > 0)).toBe(true);
    expect(r.truncado).toBe(false);
  });

  it('compra retroativa: parcelas anteriores ao ciclo atual => truncado', async () => {
    const r = await simularImpactoParcelamento(depsNov(), { ...compra(1_318_164), dataCompra: '2026-10-10' });

    expect(r.truncado).toBe(true);
  });

  it('72 parcelas: horizonte cortado em 60 e truncado true', async () => {
    const r = await simularImpactoParcelamento(depsNov(), {
      ...compra(7_200_000),
      numParcelas: 72,
    });

    expect(r.truncado).toBe(true);
    expect(r.meses.length).toBeLessThanOrEqual(60);
  });
});
