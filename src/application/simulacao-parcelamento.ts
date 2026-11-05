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
  /** O horizonte de 60 ciclos cortou parcelas. */
  truncado: boolean;
}

/** Texto do alerta, compartilhado com a simulação do copiloto. */
export function alertaReducaoDiaADia(menorDiaADiaCents: number | null): string | null {
  return menorDiaADiaCents == null
    ? null
    : `Essa compra vai reduzir seu dia a dia para ${formatBRL(menorDiaADiaCents)}/dia`;
}

// `obterProjecao` aceita no máximo 60 ciclos; parcelamentos vão até 72.
const MAX_CICLOS = 60;

/**
 * Horizonte (em ciclos a partir do atual) que cobre a compra inteira. Fatiamento
 * de string, nunca `new Date(string)`. `truncado` é true iff alguma parcela cai
 * fora do horizonte: além do limite de 60 ou antes do ciclo atual (compra
 * retroativa). ponytail: assume ciclo = mês civil; com ciclo mid-month o
 * +1 de folga cobre o ciclo, mas `truncado` pode errar por uma parcela.
 */
export function horizonteDaCompra(
  hoje: DataCivil,
  dataCompra: DataCivil,
  numParcelas: number,
): { numCiclos: number; truncado: boolean } {
  const offset =
    (Number(dataCompra.slice(0, 4)) - Number(hoje.slice(0, 4))) * 12 +
    Number(dataCompra.slice(5, 7)) -
    Number(hoje.slice(5, 7));
  const numCiclos = Math.min(Math.max(offset, 0) + 1 + numParcelas, MAX_CICLOS);
  const cobertas = Math.max(0, Math.min(numParcelas, numCiclos - offset) - Math.max(0, -offset));
  return { numCiclos, truncado: cobertas < numParcelas };
}

export const NOTA_TRUNCADO =
  'Simulação não mostra todas as parcelas (limite de 60 meses ou parcelas anteriores ao ciclo atual)';

export async function simularImpactoParcelamento(
  deps: Deps,
  input: { descricao: string; valorTotalCents: number; numParcelas: number; dataCompra: DataCivil },
): Promise<SimulacaoParcelamento> {
  const { numCiclos, truncado } = horizonteDaCompra(deps.relogio.hoje(), input.dataCompra, input.numParcelas);
  const { ciclos, cenario } = await obterProjecao(deps, {
    numCiclos,
    cenario: { tipo: 'compraParcelada', ...input },
  });
  if (!cenario) return { meses: [], alerta: null, truncado: false };

  const meses: MesSimulado[] = [];
  let menorDiaADia: number | null = null;
  cenario.delta.forEach((d, i) => {
    const antes = ciclos[i];
    const depois = cenario.ciclos[i];
    if (!antes || !depois || d.parcelasComprometidasCents <= 0) return;
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
    truncado,
    meses,
    alerta: alertaReducaoDiaADia(menorDiaADia),
  };
}
