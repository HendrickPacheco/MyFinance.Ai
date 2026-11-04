import { medirPoupancaReal } from '@/domain/finance/poupanca-real';
import { addDias } from '@/shared/data';
import type { Deps } from './deps';

export type StatusBackfill = 'MEDIDA' | 'SEM_INICIO' | 'SEM_FIM' | 'JA_TINHA';
export interface LinhaBackfill {
  cicloId: string;
  dataInicio: string;
  status: StatusBackfill;
  realCents: number | null;
}

const MAX_CICLOS = 1000;
const MAX_SNAPSHOTS = 1000;

/**
 * Preenche a poupança real dos ciclos fechados que ainda não a têm, do mais antigo
 * ao mais novo (o patrimônio final de um ciclo alimenta o início do seguinte, mesmo
 * em dry-run). Só toca ciclos com `poupancaRealCents == null`.
 */
export async function backfillPoupancaReal(
  deps: Deps,
  opcoes: { aplicar: boolean },
): Promise<LinhaBackfill[]> {
  const [fechados, snapshots] = await Promise.all([
    deps.ciclos.ultimosFechados(MAX_CICLOS),
    deps.patrimonio.ultimosSnapshots(MAX_SNAPSHOTS),
  ]);
  const ordenados = [...fechados].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  const linhas: LinhaBackfill[] = [];
  let anterior: { dataFim: string; finalCents: number | null } | null = null;

  for (const c of ordenados) {
    const encadeado =
      anterior && addDias(anterior.dataFim, 1) === c.dataInicio ? anterior.finalCents : null;

    if (c.poupancaRealCents != null) {
      linhas.push({ cicloId: c.id, dataInicio: c.dataInicio, status: 'JA_TINHA', realCents: c.poupancaRealCents });
      anterior = { dataFim: c.dataFim, finalCents: c.patrimonioFinalCents };
      continue;
    }

    const m = medirPoupancaReal({
      dataInicio: c.dataInicio,
      dataFim: c.dataFim,
      snapshots,
      patrimonioFinalCicloAnteriorCents: encadeado,
    });
    if (m.status !== 'MEDIDA') {
      linhas.push({ cicloId: c.id, dataInicio: c.dataInicio, status: m.status, realCents: null });
      anterior = { dataFim: c.dataFim, finalCents: null };
      continue;
    }
    if (opcoes.aplicar) {
      await deps.ciclos.atualizar(c.id, {
        poupancaRealCents: m.realCents,
        patrimonioInicialCents: m.inicialCents,
        patrimonioFinalCents: m.finalCents,
        fonteMedicaoPoupanca: 'SNAPSHOT',
      });
    }
    linhas.push({ cicloId: c.id, dataInicio: c.dataInicio, status: 'MEDIDA', realCents: m.realCents });
    anterior = { dataFim: c.dataFim, finalCents: m.finalCents };
  }
  return linhas;
}
