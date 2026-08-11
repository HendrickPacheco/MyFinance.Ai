/**
 * Ferramentas de futuro: projeção de ciclos e pré-mortem de compra parcelada.
 *
 * Nenhuma parcela é recalculada aqui — `simular_compra_parcelada` delega a
 * `projetarComCenario` (via `obterProjecao`), que por sua vez usa
 * `gerarParcelas`. A soma das parcelas simuladas é exatamente o valor total
 * da compra (SPEC regra 11), garantido por teste no motor.
 *
 * Os três campos de verba saem sempre juntos, com rótulo de bolso (SPEC 13).
 */
import type { Deps } from '@/application/deps';
import { obterProjecao, type ResultadoProjecao } from '@/application/projecao';
import type { CicloProjetado } from '@/domain/finance';
import { dinheiros, composicaoDaVerba, type SaidaFerramenta } from './saida';

const ORIGEM_PROJECAO = 'domain/finance/projecao.ts: projetarCiclos';
const ORIGEM_CENARIO = 'domain/finance/projecao.ts: projetarComCenario';

/** Teto do motor (RangeError acima disso) — ver MAX_CICLOS em projecao.ts. */
const MAX_HORIZONTE = 60;
/** Ciclos extras além das parcelas, para o alívio do fim aparecer na resposta. */
const FOLGA_HORIZONTE = 2;

const ROTULOS = {
  verbaVariavel:
    'verba do ciclo, com renda − poupança − fixos − provisão JÁ descontados; ' +
    'só as parcelas ainda não foram',
  parcelasComprometidas: 'já preso em parcelas que caem no ciclo',
  verbaLivre: 'o que sobra de verdade: verba variável menos parcelas',
} as const;

function cicloParaSaida(ciclo: CicloProjetado): SaidaFerramenta {
  return {
    inicio: ciclo.inicio,
    fim: ciclo.fim,
    diasTotais: ciclo.diasTotais,
    abaixoDoPiso: ciclo.abaixoDoPiso,
    ...composicaoDaVerba(ciclo),
    ...dinheiros({
      verbaVariavel: ciclo.verbaVariavelCents,
      parcelasComprometidas: ciclo.parcelasComprometidasCents,
      verbaLivre: ciclo.verbaLivreCents,
      verbaDiariaLivre: ciclo.verbaDiariaLivreCents,
    }),
  };
}

export async function projetarCiclosFerramenta(
  deps: Deps,
  argumentos: { numCiclos: number },
): Promise<SaidaFerramenta> {
  const projecao = await obterProjecao(deps, { numCiclos: argumentos.numCiclos });

  return {
    rotulos: ROTULOS,
    premissas: projecao.premissas,
    ciclos: projecao.ciclos.map(cicloParaSaida),
    comoFoiCalculado: ORIGEM_PROJECAO,
  };
}

export async function simularCompraParcelada(
  deps: Deps,
  argumentos: {
    descricao: string;
    valorTotalCents: number;
    numParcelas: number;
    dataCompra: string | null;
    numCiclos: number | null;
  },
): Promise<SaidaFerramenta> {
  const dataCompra = argumentos.dataCompra ?? deps.relogio.hoje();
  const horizonte =
    argumentos.numCiclos ??
    Math.min(MAX_HORIZONTE, argumentos.numParcelas + FOLGA_HORIZONTE);

  const projecao = await obterProjecao(deps, {
    numCiclos: horizonte,
    cenario: {
      descricao: argumentos.descricao,
      valorTotalCents: argumentos.valorTotalCents,
      numParcelas: argumentos.numParcelas,
      dataCompra,
    },
  });

  return montarSaidaCenario(projecao, dataCompra, argumentos.descricao);
}

function montarSaidaCenario(
  projecao: ResultadoProjecao,
  dataCompra: string,
  descricao: string,
): SaidaFerramenta {
  const cenario = projecao.cenario;
  if (!cenario) return { erro: 'A projeção não devolveu o cenário simulado.' };

  const ciclosQuePassamAFicarApertados = cenario.delta
    .filter((d) => d.passouAFicarAbaixoDoPiso)
    .map((d) => d.inicio);

  return {
    compra: { descricao, dataCompra },
    rotulos: ROTULOS,
    premissas: projecao.premissas,
    /** Ciclos que só ficam abaixo do piso POR CAUSA da compra. */
    ciclosQuePassamAFicarApertados,
    apertaOOrcamento: ciclosQuePassamAFicarApertados.length > 0,
    ciclosSemACompra: projecao.ciclos.map(cicloParaSaida),
    ciclosComACompra: cenario.ciclos.map(cicloParaSaida),
    impactoPorCiclo: cenario.delta.map((d) => ({
      inicio: d.inicio,
      passouAFicarAbaixoDoPiso: d.passouAFicarAbaixoDoPiso,
      ...dinheiros({
        parcelaAdicionada: d.parcelasComprometidasCents,
        variacaoVerbaLivre: d.verbaLivreCents,
        variacaoVerbaDiariaLivre: d.verbaDiariaLivreCents,
      }),
    })),
    comoFoiCalculado: ORIGEM_CENARIO,
  };
}
