/**
 * Read-model da simulação de renda hipotética (caso real 11/08/2026: "se
 * minha renda cair de 30k para 15k, dou conta da despesa até minhas parcelas
 * caírem?"). Casca fina: toda a matemática mora em `domain/finance` —
 * `projetarCiclos` (via `obterProjecao`, que já sabe montar a hipótese) e
 * `avaliarRendaHipotetica` para a leitura "a meta cabe?" por ciclo.
 *
 * MESMA REGRA DE `application/projecao.ts`: read-only de verdade. Não chama
 * `garantirCicloAtual` — uma pergunta ao copiloto não pode gravar ciclo no
 * banco (decisão D-8).
 */
import {
  avaliarRendaHipotetica,
  type AvaliacaoRendaHipotetica,
  type CicloProjetado,
  type DeltaCiclo,
} from '@/domain/finance';
import { obterProjecao } from './projecao';
import type { Deps } from './deps';

/** Teto do motor (RangeError acima disso) — ver MAX_CICLOS em projecao.ts. */
const MAX_HORIZONTE = 60;
/** Horizonte padrão quando o chamador não pede um número de ciclos: cobre o
 * ciclo atual e os próximos 5, suficiente para mostrar o alívio do fim de
 * parcelamentos comuns sem forçar o motor a projetar até o limite. */
const HORIZONTE_PADRAO = 6;

/** Um ciclo sob a hipótese, com a linha de base ao lado para o delta e a
 * avaliação "a meta ainda cabe?" já resolvida (ver `renda-hipotetica.ts`). */
export interface CicloSimulacaoRenda {
  base: CicloProjetado;
  hipotetico: CicloProjetado;
  delta: DeltaCiclo;
  avaliacao: AvaliacaoRendaHipotetica;
}

export interface ResultadoSimulacaoRenda {
  rendaHipoteticaCents: number;
  /** `true` quando o primeiro ciclo é o ciclo em curso, congelado — a
   * hipótese NÃO o alterou (SPEC 5.2, ver `ResultadoProjecao.cicloAtualCongelado`). */
  cicloAtualCongelado: boolean;
  ciclos: readonly CicloSimulacaoRenda[];
  premissas: readonly string[];
}

export async function obterSimulacaoRenda(
  deps: Deps,
  argumentos: { rendaHipoteticaCents: number; numCiclos: number | null },
): Promise<ResultadoSimulacaoRenda> {
  const numCiclos = Math.min(MAX_HORIZONTE, Math.max(1, argumentos.numCiclos ?? HORIZONTE_PADRAO));

  const projecao = await obterProjecao(deps, {
    numCiclos,
    cenario: { tipo: 'rendaHipotetica', rendaHipoteticaCents: argumentos.rendaHipoteticaCents },
  });

  const cenario = projecao.cenario;
  if (!cenario) {
    throw new Error('obterProjecao não devolveu o cenário de renda hipotética pedido.');
  }

  const ciclos: CicloSimulacaoRenda[] = projecao.ciclos.map((base, indice) => {
    const hipotetico = cenario.ciclos[indice];
    const delta = cenario.delta[indice];
    if (!hipotetico || !delta) {
      throw new Error('projeção com cenário devolveu menos ciclos que a base.');
    }
    return { base, hipotetico, delta, avaliacao: avaliarRendaHipotetica(hipotetico) };
  });

  return {
    rendaHipoteticaCents: argumentos.rendaHipoteticaCents,
    cicloAtualCongelado: projecao.cicloAtualCongelado,
    ciclos,
    premissas: projecao.premissas,
  };
}
