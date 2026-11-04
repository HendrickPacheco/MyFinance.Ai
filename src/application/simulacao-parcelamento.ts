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

export async function simularImpactoParcelamento(
  deps: Deps,
  input: { descricao: string; valorTotalCents: number; numParcelas: number; dataCompra: DataCivil },
): Promise<SimulacaoParcelamento> {
  // Ciclos entre hoje e a competência da compra (+1 de folga: o ciclo pode
  // começar no meio do mês). Parcelas anteriores ao ciclo atual não existem
  // na projeção. Fatiamento de string, nunca `new Date(string)`.
  const h = deps.relogio.hoje();
  const offset = Math.max(
    0,
    (Number(input.dataCompra.slice(0, 4)) - Number(h.slice(0, 4))) * 12 +
      Number(input.dataCompra.slice(5, 7)) -
      Number(h.slice(5, 7)),
  );
  const necessarios = offset + 1 + input.numParcelas;
  const { ciclos, cenario } = await obterProjecao(deps, {
    numCiclos: Math.min(necessarios, MAX_CICLOS),
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
    truncado: necessarios > MAX_CICLOS,
    meses,
    alerta: alertaReducaoDiaADia(menorDiaADia),
  };
}
