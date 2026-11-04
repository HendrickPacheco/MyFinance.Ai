/**
 * Impacto de uma escrita do agente sobre o ciclo atual — anexado a toda
 * resposta de `rotaEscrita` (ver `src/agent-api/escrita.ts`).
 *
 * NENHUM cálculo mora aqui (CLAUDE.md regra 4): só chama os MESMOS
 * read-models que a tela Hoje e o painel usam —
 * `obterEstadoHojeSomenteLeitura` (`src/application/hoje.ts`, de onde vem
 * `teto.tetoHojeCents` — o ritmo diário real de hoje) e `obterProjecao`
 * (`src/application/projecao.ts`, de onde vem `verbaLivreCents` — verba
 * variável menos parcelas comprometidas, D-11). As duas são `*SomenteLeitura`
 * / read-only de propósito: nunca criam ciclo como efeito colateral de medir
 * impacto.
 *
 * `*Fmt` (BRL) não é montado aqui — o serializer `comFmt` (`formatacao.ts`)
 * já adiciona o par `<campo>Fmt` para todo campo `*Cents` da resposta
 * inteira, `impactoCiclo` incluso. Duplicar a formatação aqui criaria duas
 * fontes da mesma string.
 */
import { obterEstadoHojeSomenteLeitura } from '@/application/hoje';
import { obterProjecao } from '@/application/projecao';
import type { Deps } from '@/application/deps';

export interface ImpactoCiclo {
  verbaLivreAntesCents: number;
  verbaLivreDepoisCents: number;
  ritmoDiarioAntesCents: number;
  ritmoDiarioDepoisCents: number;
}

export interface RespostaImpactoCiclo {
  impactoCiclo: ImpactoCiclo | null;
  /** Preenchido só quando `impactoCiclo` é `null` (D-14: null sempre diz por quê). */
  impactoCicloMotivo: string | null;
}

interface SnapshotCiclo {
  verbaLivreCents: number;
  ritmoDiarioCents: number;
}

const SEM_CICLO_ABERTO =
  'Não há ciclo aberto no momento — verba livre e ritmo diário não existem para comparar.';

/**
 * Lê o estado do ciclo atual para um dos dois lados do impacto (antes/depois).
 * `null` quando não há ciclo aberto, ou quando a projeção não considera
 * `ciclos[0]` o ciclo em curso congelado (`cicloAtualCongelado`) — os dois
 * casos significam "nada para comparar", nunca "zero".
 */
export async function snapshotImpactoCiclo(deps: Deps): Promise<SnapshotCiclo | null> {
  const [estadoHoje, projecao] = await Promise.all([
    obterEstadoHojeSomenteLeitura(deps),
    obterProjecao(deps, { numCiclos: 1 }),
  ]);

  const cicloProjetado = projecao.ciclos[0];
  if (!estadoHoje || !projecao.cicloAtualCongelado || !cicloProjetado) return null;

  return {
    verbaLivreCents: cicloProjetado.verbaLivreCents,
    ritmoDiarioCents: estadoHoje.teto.tetoHojeCents,
  };
}

/** Combina os dois snapshots (lidos antes e depois do handler) na forma de resposta. */
export function montarImpactoCiclo(
  antes: SnapshotCiclo | null,
  depois: SnapshotCiclo | null,
): RespostaImpactoCiclo {
  if (!antes || !depois) {
    return { impactoCiclo: null, impactoCicloMotivo: SEM_CICLO_ABERTO };
  }
  return {
    impactoCiclo: {
      verbaLivreAntesCents: antes.verbaLivreCents,
      verbaLivreDepoisCents: depois.verbaLivreCents,
      ritmoDiarioAntesCents: antes.ritmoDiarioCents,
      ritmoDiarioDepoisCents: depois.ritmoDiarioCents,
    },
    impactoCicloMotivo: null,
  };
}
