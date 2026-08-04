/**
 * Ferramentas de análise de corte e de assinaturas recorrentes.
 *
 * Ambas leem os últimos ciclos FECHADOS — não dependem de ciclo aberto, então
 * não precisam da variante read-only: `obterAnalise` já é só leitura.
 *
 * A detecção de assinatura é código puro, sem IA nenhuma
 * (`domain/finance/analise.ts: detectarAssinaturas`).
 */
import type { Deps } from '@/application/deps';
import { obterAnalise } from '@/application/analise';
import { dinheiros, type SaidaFerramenta } from './saida';

const ORIGEM_CORTE = 'domain/finance/analise.ts: analiseCategoria';
const ORIGEM_ASSINATURAS = 'domain/finance/analise.ts: detectarAssinaturas';

/** Padrão da tela Análise quando o modelo não especifica (SPEC 5.5). */
const CICLOS_PADRAO = 3;

export async function analiseCorte(
  deps: Deps,
  argumentos: { numCiclos: number | null },
): Promise<SaidaFerramenta> {
  const analise = await obterAnalise(deps, argumentos.numCiclos ?? CICLOS_PADRAO);

  return {
    ciclosConsiderados: analise.ciclosConsiderados,
    semHistorico: analise.ciclosConsiderados === 0,
    categorias: analise.ranking.map((linha) => ({
      nome: linha.nome,
      tendencia: linha.tendencia,
      essencial: linha.essencial,
      frequenciaMediaPorCiclo: linha.frequenciaMedia,
      ...dinheiros({
        custoAnualizado: linha.custoAnualizadoCents,
        totalMedioMensal: linha.totalMedioMensalCents,
        ticketMedio: linha.ticketMedioCents,
      }),
    })),
    comoFoiCalculado: ORIGEM_CORTE,
  };
}

export async function assinaturasDetectadas(
  deps: Deps,
  argumentos: { numCiclos: number | null },
): Promise<SaidaFerramenta> {
  const analise = await obterAnalise(deps, argumentos.numCiclos ?? CICLOS_PADRAO);

  return {
    ciclosConsiderados: analise.ciclosConsiderados,
    assinaturas: analise.assinaturas.map((a) => ({
      descricao: a.descricaoNormalizada,
      ciclosConsecutivos: a.ciclosConsecutivos,
      ...dinheiros({ valor: a.valorCents, custoAnualizado: a.custoAnualizadoCents }),
    })),
    comoFoiCalculado: ORIGEM_ASSINATURAS,
  };
}
