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
import { formatBRL } from '@/shared/dinheiro';
import type { Deps } from '@/application/deps';
import { obterProjecao, type ResultadoProjecao } from '@/application/projecao';
import { obterSimulacaoMetaPrazo } from '@/application/meta-prazo';
import { obterSimulacaoRenda, type CicloSimulacaoRenda } from '@/application/renda-hipotetica';
import type { CicloProjetado } from '@/domain/finance';
import { dinheiro, dinheiros, composicaoDaVerba, erroFerramenta, type SaidaFerramenta } from './saida';

const ORIGEM_PROJECAO = 'domain/finance/projecao.ts: projetarCiclos';
const ORIGEM_CENARIO = 'domain/finance/projecao.ts: projetarComCenario';
const ORIGEM_META_PRAZO = 'domain/finance/meta-prazo.ts: simularMetaPrazo';
const ORIGEM_RENDA_HIPOTETICA =
  'application/renda-hipotetica.ts: obterSimulacaoRenda → domain/finance/renda-hipotetica.ts: avaliarRendaHipotetica';

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
      tipo: 'compraParcelada',
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

const ROTULOS_META_PRAZO = {
  aportePrevisto:
    'a poupança-alvo daquele ciclo; no ciclo atual, reduzida quando o gasto ' +
    'já realizado estourou a verba variável (ver reduzidoPorGastoExcedente)',
  aporteDisponivelPadrao: 'a poupança-alvo de um ciclo SEM o ajuste do excedente — a referência de "quanto normalmente sobra"',
  aportePorCicloNecessario: 'o aporte constante que bateria o alvo exatamente no prazo',
  sobraPorCiclo: 'aporteDisponivelPadrao − aportePorCicloNecessario; negativo quer dizer que falta poupar mais que o normal',
} as const;

/**
 * "Quanto preciso separar por ciclo para juntar R$ X até a data Y" — a
 * pergunta que faltava ferramenta (caso real 11/08/2026, ver o cabeçalho do
 * motor em domain/finance/meta-prazo.ts). Casca fina: toda a matemática vive
 * em `simularMetaPrazo`, chamado pelo caso de uso `obterSimulacaoMetaPrazo`.
 *
 * Erro de domínio (prazo anterior ao ciclo atual) não escapa como exceção
 * genérica: aqui ele é capturado e devolvido como mensagem legível, o mesmo
 * contrato que `executarFerramenta` já impõe para qualquer outra ferramenta.
 */
export async function simularMetaPrazoFerramenta(
  deps: Deps,
  argumentos: { alvoCents: number; dataLimite: string },
): Promise<SaidaFerramenta> {
  let resultado;
  try {
    resultado = await obterSimulacaoMetaPrazo(deps, argumentos);
  } catch (erro) {
    return erroFerramenta(erro instanceof Error ? erro.message : String(erro));
  }

  return {
    dataLimite: resultado.dataLimite,
    numCiclos: resultado.numCiclos,
    rotulos: ROTULOS_META_PRAZO,
    ciclos: resultado.ciclos.map((ciclo) => ({
      inicio: ciclo.inicio,
      fim: ciclo.fim,
      reduzidoPorGastoExcedente: ciclo.reduzidoPorGastoExcedente,
      // D-15: o booleano sozinho deixava o modelo dizer QUE reduziu sem saber
      // de quanto nem a partir de quê. As partes viajam junto, e o motivo em
      // TEXTO só aparece no ciclo que de fato foi reduzido — rótulo estático
      // idêntico nos dois casos não informa nada (foi o defeito da D-14).
      ...(ciclo.reduzidoPorGastoExcedente
        ? {
            motivoReducao:
              `A meta cheia deste ciclo é ${formatBRL(ciclo.poupancaAlvoOriginalCents)}, mas o gasto já ` +
              `realizado estourou a verba variável em ${formatBRL(ciclo.reducaoPorExcedenteCents)}. ` +
              'Esse excedente sai da própria poupança do ciclo — é o mesmo dinheiro, não um segundo buraco.',
          }
        : {}),
      ...dinheiros({
        aportePrevisto: ciclo.aportePrevistoCents,
        poupancaAlvoOriginal: ciclo.poupancaAlvoOriginalCents,
        reducaoPorExcedente: ciclo.reducaoPorExcedenteCents,
      }),
    })),
    alcanca: resultado.alcanca,
    ...dinheiros({
      alvo: resultado.alvoCents,
      totalAcumulavel: resultado.totalAcumulavelCents,
      aportePorCicloNecessario: resultado.aportePorCicloNecessarioCents,
      aporteDisponivelPadrao: resultado.aporteDisponivelPadraoCents,
      sobraPorCiclo: resultado.sobraPorCicloCents,
      ...(resultado.folgaCents != null ? { folga: resultado.folgaCents } : {}),
      ...(resultado.faltaCents != null ? { falta: resultado.faltaCents } : {}),
    }),
    comoFoiCalculado: ORIGEM_META_PRAZO,
  };
}

const ROTULOS_RENDA_HIPOTETICA = {
  comprometidoMensal: 'fixos + parcelas do ciclo — o que precisa ser pago de qualquer forma, sem contar a meta de poupança (que não é gasto)',
  sobraAposComprometidos: 'rendaHipotética − comprometidoMensal: o que sobra de verdade para viver, DEPOIS de pagar fixos e parcelas',
  poupancaMaximaPossivel: 'o máximo que ainda daria para poupar nessa renda depois de fixos, provisão e parcelas (nunca abaixo de zero)',
  metaPoupancaCabeNaRenda:
    'false quando a meta de poupança configurada não cabe mais na renda hipotética; NÃO significa que a renda é insuficiente para viver — para isso, olhe sobraAposComprometidos',
} as const;

/**
 * Um ciclo da simulação, na saída da ferramenta. `congelado` é o que impede o
 * copiloto de fingir que a hipótese mudou o ciclo em curso — quando `true`,
 * todo número do ciclo é o REAL gravado, e a renda hipotética simplesmente
 * não chegou a valer ali (SPEC 5.2).
 */
function cicloRendaHipoteticaParaSaida(item: CicloSimulacaoRenda, congelado: boolean): SaidaFerramenta {
  return {
    inicio: item.hipotetico.inicio,
    fim: item.hipotetico.fim,
    congelado,
    ...(congelado
      ? {
          observacaoCongelado:
            'Este é o ciclo em curso: os valores são os REALMENTE gravados quando ele nasceu, não os da renda hipotética — o ciclo em curso é congelado e não é reescrito por nenhuma hipótese.',
        }
      : {}),
    abaixoDoPiso: item.hipotetico.abaixoDoPiso,
    metaPoupancaCabeNaRenda: item.avaliacao.metaPoupancaCabeNaRenda,
    motivoMetaNaoCabe: item.avaliacao.motivoMetaNaoCabe,
    ...composicaoDaVerba(item.hipotetico),
    ...dinheiros({
      verbaVariavel: item.hipotetico.verbaVariavelCents,
      parcelasComprometidas: item.hipotetico.parcelasComprometidasCents,
      verbaLivre: item.hipotetico.verbaLivreCents,
      comprometidoMensal: item.avaliacao.comprometidoMensalCents,
      sobraAposComprometidos: item.avaliacao.sobraAposComprometidosCents,
      poupancaMaximaPossivel: item.avaliacao.poupancaMaximaPossivelCents,
      variacaoVerbaLivre: item.delta.verbaLivreCents,
      variacaoParcelasComprometidas: item.delta.parcelasComprometidasCents,
    }),
  };
}

/**
 * "Se minha renda cair para X, dou conta das despesas?" (caso real
 * 11/08/2026). NÃO edita a Config — é só leitura, ver `obterSimulacaoRenda`.
 * O ciclo em curso nunca é alterado pela hipótese (SPEC 5.2); a resposta
 * declara isso em `cicloAtualCongelado` e em cada ciclo (`congelado`), nunca
 * deixando implícito.
 */
export async function simularRendaFerramenta(
  deps: Deps,
  argumentos: { rendaHipoteticaCents: number; numCiclos: number | null },
): Promise<SaidaFerramenta> {
  let resultado;
  try {
    resultado = await obterSimulacaoRenda(deps, argumentos);
  } catch (erro) {
    return erroFerramenta(erro instanceof Error ? erro.message : String(erro));
  }

  return {
    cicloAtualCongelado: resultado.cicloAtualCongelado,
    observacaoCicloAtual: resultado.cicloAtualCongelado
      ? 'O ciclo em curso já nasceu com a renda vigente e está CONGELADO (SPEC 5.2): a renda hipotética só passa a valer a partir do próximo ciclo, marcado congelado: false abaixo.'
      : 'Não há ciclo em curso gravado: todos os ciclos da simulação já usam a renda hipotética.',
    rotulos: ROTULOS_RENDA_HIPOTETICA,
    premissas: resultado.premissas,
    ...dinheiro('rendaHipotetica', resultado.rendaHipoteticaCents),
    ciclos: resultado.ciclos.map((item, indice) =>
      cicloRendaHipoteticaParaSaida(item, indice === 0 && resultado.cicloAtualCongelado),
    ),
    comoFoiCalculado: ORIGEM_RENDA_HIPOTETICA,
  };
}
