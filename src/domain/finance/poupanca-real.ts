/**
 * Poupança REAL = variação do patrimônio entre o início e o fim do ciclo (D3).
 * Funções puras; a meta é objetivo, não dedução (D-16).
 */
import { diffDias, type DataCivil } from '@/shared/data';

// ponytail: constante (D5), vira campo de Config se o dono pedir
export const TOLERANCIA_SNAPSHOT_DIAS = 5;

type Snap = { data: DataCivil; totalCents: number };

/** Menor |diffDias| dentro da tolerância; empate → o mais antigo. */
export function snapshotMaisProximo(
  snapshots: readonly Snap[],
  alvo: DataCivil,
  toleranciaDias: number = TOLERANCIA_SNAPSHOT_DIAS,
): Snap | null {
  let melhor: Snap | null = null;
  let melhorDist = Infinity;
  for (const s of snapshots) {
    const d = Math.abs(diffDias(s.data, alvo));
    if (d > toleranciaDias) continue;
    if (d < melhorDist || (d === melhorDist && melhor !== null && s.data < melhor.data)) {
      melhor = s;
      melhorDist = d;
    }
  }
  return melhor;
}

export type MedicaoPoupanca =
  | {
      status: 'MEDIDA';
      fonte: 'SNAPSHOT';
      inicialCents: number;
      finalCents: number;
      realCents: number;
      dataInicial: DataCivil | null;
      dataFinal: DataCivil;
    }
  | { status: 'SEM_INICIO' | 'SEM_FIM'; motivo: string };

export function medirPoupancaReal(p: {
  dataInicio: DataCivil;
  dataFim: DataCivil;
  snapshots: readonly Snap[];
  patrimonioFinalCicloAnteriorCents: number | null;
}): MedicaoPoupanca {
  const ini = snapshotMaisProximo(p.snapshots, p.dataInicio);
  const inicialCents = ini?.totalCents ?? p.patrimonioFinalCicloAnteriorCents;
  if (inicialCents === null) {
    return {
      status: 'SEM_INICIO',
      motivo: `Sem snapshot de patrimônio a até ${TOLERANCIA_SNAPSHOT_DIAS} dias do início do ciclo (${p.dataInicio}) e sem patrimônio final do ciclo anterior.`,
    };
  }
  const fim = snapshotMaisProximo(p.snapshots, p.dataFim);
  if (!fim) {
    return {
      status: 'SEM_FIM',
      motivo: `Sem snapshot de patrimônio a até ${TOLERANCIA_SNAPSHOT_DIAS} dias do fim do ciclo (${p.dataFim}).`,
    };
  }
  return {
    status: 'MEDIDA',
    fonte: 'SNAPSHOT',
    inicialCents,
    finalCents: fim.totalCents,
    realCents: fim.totalCents - inicialCents,
    dataInicial: ini?.data ?? null,
    dataFinal: fim.data,
  };
}

/**
 * Guardado em curso. Compara realidade com realidade OU razão com razão — nunca
 * os dois misturados (D-13): snapshot no ciclo − patrimônio inicial; sem ele, o
 * efeito líquido das transações do ciclo no razão (`deltaLedgerCicloCents`,
 * calculado pela aplicação). Subtrair o snapshot inicial do saldo do razão
 * transformaria a divergência de conciliação em "guardado".
 */
export function estimarPoupancaEmCurso(p: {
  dataInicio: DataCivil;
  hoje: DataCivil;
  snapshots: readonly Snap[];
  deltaLedgerCicloCents: number | null;
  patrimonioFinalCicloAnteriorCents: number | null;
}): { realCents: number; fonte: 'SNAPSHOT' | 'SALDO_CONTAS'; estimado: true } | { realCents: null; motivo: string } {
  const inicialCents =
    snapshotMaisProximo(p.snapshots, p.dataInicio)?.totalCents ?? p.patrimonioFinalCicloAnteriorCents;
  // "Atual" = snapshot mais recente em [dataInicio, hoje]. Um snapshot anterior ao ciclo nunca é
  // "atual"; se o único snapshot do ciclo também foi o inicial, ele vale como atual (estimativa 0).
  const atual = p.snapshots
    .filter((s) => s.data >= p.dataInicio && s.data <= p.hoje)
    .reduce<Snap | null>((m, s) => (m === null || s.data > m.data ? s : m), null);
  if (atual && inicialCents !== null) {
    return { realCents: atual.totalCents - inicialCents, fonte: 'SNAPSHOT', estimado: true };
  }
  if (p.deltaLedgerCicloCents !== null) {
    return { realCents: p.deltaLedgerCicloCents, fonte: 'SALDO_CONTAS', estimado: true };
  }
  return {
    realCents: null,
    motivo:
      inicialCents === null
        ? `Sem patrimônio de partida (nenhum snapshot a até ${TOLERANCIA_SNAPSHOT_DIAS} dias do início do ciclo, ${p.dataInicio}, nem patrimônio final do ciclo anterior) e nenhum lançamento movimentou contas de patrimônio — registre um snapshot para medir.`
        : 'Sem snapshot no ciclo e nenhum lançamento movimentou contas de patrimônio — registre um snapshot para medir.',
  };
}

export function compararComMeta(
  realCents: number,
  metaCents: number,
): { diferencaCents: number; percentual: number | null } {
  return {
    diferencaCents: realCents - metaCents,
    percentual: metaCents > 0 ? Math.round((realCents / metaCents) * 1000) / 10 : null,
  };
}

export function mediaPoupancaReal(
  ciclosMaisRecentesPrimeiro: readonly { poupancaRealCents: number | null }[],
  n: number,
): { mediaCents: number | null; ciclosConsiderados: number } {
  const v = ciclosMaisRecentesPrimeiro
    .slice(0, n)
    .map((c) => c.poupancaRealCents)
    .filter((x): x is number => x !== null);
  if (v.length === 0) return { mediaCents: null, ciclosConsiderados: 0 };
  return { mediaCents: Math.floor(v.reduce((a, b) => a + b, 0) / v.length), ciclosConsiderados: v.length };
}

export function alertaLancamentosFaltando(p: {
  rendaCents: number;
  fixosCents: number;
  despesasLancadasCents: number;
  poupancaRealCents: number;
}): { semExplicacaoCents: number; limiarCents: number } | null {
  const semExplicacaoCents = p.rendaCents - (p.fixosCents + p.despesasLancadasCents) - p.poupancaRealCents;
  const limiarCents = Math.max(100_000, Math.floor((p.rendaCents * 5) / 100));
  return semExplicacaoCents > limiarCents ? { semExplicacaoCents, limiarCents } : null;
}

export function alertaGastoVariavelBaixo(p: {
  gastoVariavelCents: number;
  gastosAnterioresCents: readonly number[];
}): { mediaAnteriorCents: number; percentual: number } | null {
  if (p.gastosAnterioresCents.length === 0) return null;
  const mediaAnteriorCents = Math.floor(
    p.gastosAnterioresCents.reduce((a, b) => a + b, 0) / p.gastosAnterioresCents.length,
  );
  if (mediaAnteriorCents <= 0 || p.gastoVariavelCents * 100 >= mediaAnteriorCents * 30) return null;
  return { mediaAnteriorCents, percentual: Math.round((p.gastoVariavelCents / mediaAnteriorCents) * 1000) / 10 };
}

/**
 * Poupança ESTIMADA do ciclo (D-16): o que sobra da verba livre depois do
 * gasto variável (sem parcelas) e do que ainda resta nos baldes dia a dia e extras.
 */
export function poupancaEstimadaDoCicloCents(p: {
  verbaLivreCents: number;
  gastoVariavelSemParcelasCents: number;
  diaADiaRestanteCents: number;
  extrasRestanteCents: number;
}): number {
  return Math.max(
    0,
    p.verbaLivreCents -
      p.gastoVariavelSemParcelasCents -
      p.diaADiaRestanteCents -
      Math.max(p.extrasRestanteCents, 0),
  );
}
