/**
 * Análise de corte (SPEC 5.5). Lógica diferente do controle diário: opera
 * sobre a média dos últimos N ciclos fechados (default 3). O alvo é
 * recorrência pequena, não gasto grande isolado — por isso o número de
 * impacto é o custo anualizado, e cada categoria mostra frequência × ticket.
 */
import { somaCents } from '@/shared/dinheiro';
import type { Tendencia } from '@/domain/model/enums';

/** Transações de UMA categoria agrupadas por ciclo (ordem cronológica: 1º = mais antigo). */
export interface CicloDaCategoria {
  cicloId: string;
  valoresCents: readonly number[]; // uma por DESPESA no ciclo
  estornosCents?: readonly number[]; // uma por ESTORNO no ciclo (abate o total)
}

export interface ResultadoAnaliseCategoria {
  totalMedioMensalCents: number;
  frequenciaMedia: number; // nº de transações por ciclo
  ticketMedioCents: number;
  custoAnualizadoCents: number; // totalMedioMensal × 12 (número de impacto)
  tendencia: Tendencia;
  essencial: boolean;
}

const LIMIAR_TENDENCIA = 0.1; // ±10% entre 1º e último ciclo para sair de ESTAVEL

function tendenciaEntre(primeiro: number, ultimo: number): Tendencia {
  if (primeiro === 0) {
    if (ultimo === 0) return 'ESTAVEL';
    return 'SUBINDO';
  }
  const variacao = (ultimo - primeiro) / primeiro;
  if (variacao > LIMIAR_TENDENCIA) return 'SUBINDO';
  if (variacao < -LIMIAR_TENDENCIA) return 'CAINDO';
  return 'ESTAVEL';
}

export function analiseCategoria(params: {
  ciclos: readonly CicloDaCategoria[];
  essencial: boolean;
}): ResultadoAnaliseCategoria {
  const { ciclos, essencial } = params;

  if (ciclos.length === 0) {
    return {
      totalMedioMensalCents: 0,
      frequenciaMedia: 0,
      ticketMedioCents: 0,
      custoAnualizadoCents: 0,
      tendencia: 'ESTAVEL',
      essencial,
    };
  }

  // Total líquido por ciclo = despesas − estornos (consistente com o motor de
  // gasto). Ticket e frequência descrevem as compras (despesas brutas).
  const despesasPorCiclo = ciclos.map((c) => somaCents(c.valoresCents));
  const estornosPorCiclo = ciclos.map((c) => somaCents(c.estornosCents ?? []));
  const liquidoPorCiclo = despesasPorCiclo.map((d, i) => d - (estornosPorCiclo[i] ?? 0));
  const contagensPorCiclo = ciclos.map((c) => c.valoresCents.length);

  const despesasGeral = despesasPorCiclo.reduce((a, b) => a + b, 0);
  const liquidoGeral = liquidoPorCiclo.reduce((a, b) => a + b, 0);
  const contagemGeral = contagensPorCiclo.reduce((a, b) => a + b, 0);

  const totalMedioMensalCents = Math.round(liquidoGeral / ciclos.length);
  const frequenciaMedia = contagemGeral / ciclos.length;
  const ticketMedioCents = contagemGeral > 0 ? Math.round(despesasGeral / contagemGeral) : 0;
  const custoAnualizadoCents = totalMedioMensalCents * 12;

  const primeiro = liquidoPorCiclo[0] ?? 0;
  const ultimo = liquidoPorCiclo[liquidoPorCiclo.length - 1] ?? 0;

  return {
    totalMedioMensalCents,
    frequenciaMedia,
    ticketMedioCents,
    custoAnualizadoCents,
    tendencia: tendenciaEntre(primeiro, ultimo),
    essencial,
  };
}

/**
 * Detector de assinaturas: transações com mesmo valor e mesma descrição
 * normalizada em 3+ ciclos CONSECUTIVOS → recorrência fixa disfarçada de
 * variável. Devolve o custo anualizado (valor mensal × 12).
 */
export interface TransacaoAssinatura {
  descricao: string | null;
  valorCents: number;
  cicloId: string;
}

export interface AssinaturaDetectada {
  descricaoNormalizada: string;
  valorCents: number;
  ciclosConsecutivos: number;
  custoAnualizadoCents: number;
}

/** Normaliza descrição: minúsculas, sem acentos, espaços colapsados. */
export function normalizarDescricao(descricao: string | null): string {
  if (!descricao) return '';
  return descricao
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove acentos (marcas combinantes)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectarAssinaturas(params: {
  transacoes: readonly TransacaoAssinatura[];
  ciclosOrdenados: readonly string[]; // ordem cronológica dos ciclos considerados
  minCiclosConsecutivos?: number;
}): AssinaturaDetectada[] {
  const minConsecutivos = params.minCiclosConsecutivos ?? 3;
  const indicePorCiclo = new Map(params.ciclosOrdenados.map((id, i) => [id, i]));

  // Agrupa por (valor, descrição normalizada) -> conjunto de índices de ciclo.
  const grupos = new Map<string, { valorCents: number; descNorm: string; indices: Set<number> }>();

  for (const t of params.transacoes) {
    const idx = indicePorCiclo.get(t.cicloId);
    if (idx === undefined) continue;
    const descNorm = normalizarDescricao(t.descricao);
    const chave = `${t.valorCents}::${descNorm}`;
    const grupo = grupos.get(chave) ?? { valorCents: t.valorCents, descNorm, indices: new Set() };
    grupo.indices.add(idx);
    grupos.set(chave, grupo);
  }

  const detectadas: AssinaturaDetectada[] = [];
  for (const grupo of grupos.values()) {
    const maxRun = maiorSequenciaConsecutiva([...grupo.indices]);
    if (maxRun >= minConsecutivos) {
      detectadas.push({
        descricaoNormalizada: grupo.descNorm,
        valorCents: grupo.valorCents,
        ciclosConsecutivos: maxRun,
        custoAnualizadoCents: grupo.valorCents * 12,
      });
    }
  }

  return detectadas.sort((a, b) => b.custoAnualizadoCents - a.custoAnualizadoCents);
}

/** Maior sequência de inteiros consecutivos dentro de um conjunto de índices. */
function maiorSequenciaConsecutiva(indices: number[]): number {
  if (indices.length === 0) return 0;
  const ordenados = [...indices].sort((a, b) => a - b);
  let melhor = 1;
  let atual = 1;
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1] as number;
    const corrente = ordenados[i] as number;
    if (corrente === anterior + 1) {
      atual += 1;
      melhor = Math.max(melhor, atual);
    } else if (corrente !== anterior) {
      atual = 1;
    }
  }
  return melhor;
}
