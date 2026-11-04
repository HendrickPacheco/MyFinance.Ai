/**
 * Pré-visualização do impacto de uma compra parcelada nas duas verbas (dia a
 * dia e extras), mês a mês. Leitura pura: reaproveita `obterProjecao` com o
 * cenário `compraParcelada` — nenhum cálculo ou rateio mora aqui (regra 4).
 */
import type { DataCivil } from '@/shared/data';
import { formatBRL } from '@/shared/dinheiro';
import type { Deps } from './deps';
import { obterProjecao } from './projecao';

export interface MesSimulado {
  inicio: DataCivil;
  parcelaCents: number;
  extrasRestanteAntesCents: number;
  extrasRestanteDepoisCents: number;
  diaADiaDiarioAntesCents: number;
  diaADiaDiarioDepoisCents: number;
}

export interface SimulacaoParcelamento {
  meses: MesSimulado[];
  alerta: string | null;
}

// `obterProjecao` aceita no máximo 60 ciclos; parcelamentos vão até 72.
const MAX_CICLOS = 60;

export async function simularImpactoParcelamento(
  deps: Deps,
  input: { descricao: string; valorTotalCents: number; numParcelas: number; dataCompra: DataCivil },
): Promise<SimulacaoParcelamento> {
  const { ciclos, cenario } = await obterProjecao(deps, {
    numCiclos: Math.min(input.numParcelas, MAX_CICLOS),
    cenario: { tipo: 'compraParcelada', ...input },
  });
  if (!cenario) return { meses: [], alerta: null };

  const meses: MesSimulado[] = [];
  let menorDiaADia: number | null = null;
  cenario.delta.forEach((d, i) => {
    const antes = ciclos[i];
    const depois = cenario.ciclos[i];
    if (!antes || !depois) return;
    meses.push({
      inicio: d.inicio,
      parcelaCents: d.parcelasComprometidasCents,
      extrasRestanteAntesCents: antes.extrasRestanteCents,
      extrasRestanteDepoisCents: depois.extrasRestanteCents,
      diaADiaDiarioAntesCents: antes.diaADiaDiarioCents,
      diaADiaDiarioDepoisCents: depois.diaADiaDiarioCents,
    });
    if (d.passouAReduzirDiaADia) {
      menorDiaADia = Math.min(menorDiaADia ?? Infinity, depois.diaADiaDiarioCents);
    }
  });

  return {
    meses,
    alerta:
      menorDiaADia == null
        ? null
        : `Essa compra vai reduzir seu dia a dia para ${formatBRL(menorDiaADia)}/dia`,
  };
}
