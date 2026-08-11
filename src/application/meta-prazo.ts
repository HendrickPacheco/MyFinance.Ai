/**
 * Read-model da simulação de meta com prazo (ver `domain/finance/meta-prazo.ts`
 * para a matemática e o porquê do ajuste do ciclo atual).
 *
 * MESMA REGRA DE `application/projecao.ts`: read-only de verdade. Não chama
 * `garantirCicloAtual` — uma pergunta ao copiloto não pode gravar ciclo no
 * banco (decisão D-8). Sem ciclo aberto, a projeção nasce só da Config e o
 * excedente do ciclo atual não existe (`excedenteCicloAtualCents: null`).
 */
import { diffDias, type DataCivil } from '@/shared/data';
import { simularMetaPrazo, type ResultadoSimulacaoMetaPrazo } from '@/domain/finance';
import { obterProjecao } from './projecao';
import { obterEstadoCicloSomenteLeitura } from './ciclo-view';
import type { Deps } from './deps';

/** Teto do motor (RangeError acima disso) — ver MAX_CICLOS em projecao.ts. */
const MAX_HORIZONTE = 60;
/** Ciclos extras alem do necessário, para não cortar a data-limite bem na borda. */
const FOLGA_HORIZONTE = 2;
/** Estimativa DELIBERADAMENTE conservadora do tamanho de um ciclo (máx. ~31
 * dias): superestimar o horizonte é inofensivo, o motor descarta o excesso;
 * subestimar cortaria ciclos que caem antes de `dataLimite`. */
const DIAS_MINIMOS_POR_CICLO = 28;

/**
 * Quantos ciclos projetar para cobrir `dataLimite` com folga. Nunca negativo:
 * `dataLimite` no passado (relativo a hoje) ainda pede pelo menos 1 ciclo — é
 * o domínio, não este cálculo de horizonte, quem recusa a data com uma
 * mensagem legível (`simularMetaPrazo` lança se nenhum ciclo cobrir o prazo).
 */
function horizonteNecessario(hoje: DataCivil, dataLimite: DataCivil): number {
  const dias = Math.max(0, diffDias(dataLimite, hoje));
  const ciclosEstimados = Math.ceil(dias / DIAS_MINIMOS_POR_CICLO) + FOLGA_HORIZONTE;
  return Math.min(MAX_HORIZONTE, Math.max(1, ciclosEstimados));
}

/**
 * `max(0, gastoRealizado − verbaVariavel)` do ciclo atual. `null` quando não
 * há ciclo aberto — não existe "gasto do ciclo atual" para comparar.
 */
async function excedenteCicloAtualCents(
  deps: Deps,
  verbaVariavelCicloAtualCents: number,
): Promise<number | null> {
  const estado = await obterEstadoCicloSomenteLeitura(deps);
  if (!estado) return null;
  return Math.max(0, estado.gastoRealizadoCents - verbaVariavelCicloAtualCents);
}

export async function obterSimulacaoMetaPrazo(
  deps: Deps,
  argumentos: { alvoCents: number; dataLimite: DataCivil },
): Promise<ResultadoSimulacaoMetaPrazo> {
  const hoje = deps.relogio.hoje();
  const numCiclos = horizonteNecessario(hoje, argumentos.dataLimite);

  const projecao = await obterProjecao(deps, { numCiclos });
  const cicloAtual = projecao.ciclos[0];

  const excedente = cicloAtual
    ? await excedenteCicloAtualCents(deps, cicloAtual.verbaVariavelCents)
    : null;

  return simularMetaPrazo({
    alvoCents: argumentos.alvoCents,
    dataLimite: argumentos.dataLimite,
    ciclos: projecao.ciclos.map((ciclo) => ({
      inicio: ciclo.inicio,
      fim: ciclo.fim,
      poupancaAlvoCents: ciclo.poupancaAlvoCents,
    })),
    excedenteCicloAtualCents: excedente,
  });
}
