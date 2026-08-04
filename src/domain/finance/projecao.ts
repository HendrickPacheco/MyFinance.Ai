/**
 * Projeção de ciclos futuros (SPEC seção 5, Fase C). Função PURA: sem I/O,
 * sem `new Date()`, sem aleatoriedade. Duas chamadas com a mesma entrada
 * devolvem estruturas idênticas.
 *
 * Nenhuma fórmula é reimplementada aqui. Este arquivo ORQUESTRA o motor que
 * já existe — `limitesCiclo`, `poupancaAlvoCents`, `provisaoMensalCents`,
 * `verbaVariavelCents`, `verificarMetaIrreal`, `gerarParcelas` — e monta a
 * saída por ciclo. Se alguma conta faltar, ela vira função pura nova e
 * testada; nunca uma linha solta no meio daqui.
 *
 * PREMISSAS DECLARADAS (a projeção não adivinha o futuro):
 *  1. Sobra ZERO nos ciclos futuros. Não há como saber o gasto de um ciclo que
 *     ainda não aconteceu, então só o ciclo 1 recebe rollover — o que já está
 *     congelado no registro do ciclo atual. Ciclos ≥ 2 recebem zero, inclusive
 *     quando `destinoSobra === 'ROLLOVER'`.
 *  2. Custo fixo CONSTANTE em todo o horizonte. `CustoFixo` não tem data de
 *     término no schema (decisão D-7); assumir constante é simplificação
 *     declarada, não bug.
 *  3. Renda prevista constante e igual à da Config vigente.
 *
 * SOBRE PARCELA — leia antes de "corrigir" qualquer coisa (decisão D-11):
 * parcela CONSOME a verba variável, não é deduzida dela. `verbaVariavelCents`
 * é obtido chamando a função do motor com os MESMOS argumentos que
 * `garantirCicloAtual` usa, sem nenhum parâmetro de parcela.
 * `parcelasComprometidasCents` é somado depois e à parte. Parcela aparece uma
 * vez só, e nunca dentro de `verbaVariavelCents`.
 */
import { estaNoIntervalo } from '@/shared/data';
import { somaCents } from '@/shared/dinheiro';
import { diasTotaisCiclo, limitesCiclo, proximoCicloApos } from './ciclo';
import { gerarParcelas } from './parcelamento';
import { verificarMetaIrreal } from './sugestoes';
import { poupancaAlvoCents, provisaoMensalCents, verbaVariavelCents } from './verba';
import type {
  CenarioHipotetico,
  CicloProjetado,
  DeltaCiclo,
  EntradaProjecao,
  ObrigacaoFutura,
  ProjecaoComCenario,
} from './projecao-tipos';
import type { LimitesCiclo } from './tipos';

const MIN_CICLOS = 1;
const MAX_CICLOS = 60;

/** Materializa as parcelas de uma compra hipotética como obrigações futuras. */
function obrigacoesDoCenario(cenario: CenarioHipotetico): ObrigacaoFutura[] {
  return gerarParcelas({
    valorTotalCents: cenario.valorTotalCents,
    numParcelas: cenario.numParcelas,
    dataCompra: cenario.dataCompra,
  }).map((parcela) => ({
    data: parcela.data,
    valorCents: parcela.valorCents,
    // Compra hipotética não tem `Parcelamento` no banco.
    parcelamentoId: null,
  }));
}

/** Parcelas que caem dentro do intervalo do ciclo. Somadas UMA vez, à parte. */
function comprometidoNoCiclo(
  obrigacoes: readonly ObrigacaoFutura[],
  limites: LimitesCiclo,
): number {
  return somaCents(
    obrigacoes
      .filter((o) => estaNoIntervalo(o.data, limites.inicio, limites.fim))
      .map((o) => o.valorCents),
  );
}

/**
 * Monta um ciclo projetado. Recebe a verba JÁ DECIDIDA — calculada pelo motor
 * (ciclo futuro) ou lida do registro congelado (ciclo atual) — para que exista
 * um único lugar onde parcela e piso são aplicados.
 */
function montarCiclo(params: {
  limites: LimitesCiclo;
  rendaPrevistaCents: number;
  poupancaAlvoCents: number;
  fixosCents: number;
  provisaoMensalCents: number;
  verbaVariavelCents: number;
  rolloverRecebidoCents: number;
  obrigacoes: readonly ObrigacaoFutura[];
  pisoDiarioVerbaCents: number;
}): CicloProjetado {
  const diasTotais = diasTotaisCiclo(params.limites);

  // Somado DEPOIS e à parte — parcela nunca entra no cálculo da verba.
  const parcelasComprometidas = comprometidoNoCiclo(params.obrigacoes, params.limites);
  const verbaLivre = params.verbaVariavelCents - parcelasComprometidas;

  // Avaliado sobre a verba LIVRE: sobre a bruta esconderia o aperto da parcela.
  // Reusa a divisão do motor em vez de repeti-la aqui.
  const piso = verificarMetaIrreal({
    verbaVariavelCents: verbaLivre,
    diasCiclo: diasTotais,
    pisoDiarioCents: params.pisoDiarioVerbaCents,
  });

  return {
    inicio: params.limites.inicio,
    fim: params.limites.fim,
    diasTotais,
    rendaPrevistaCents: params.rendaPrevistaCents,
    poupancaAlvoCents: params.poupancaAlvoCents,
    fixosCents: params.fixosCents,
    provisaoMensalCents: params.provisaoMensalCents,
    verbaVariavelCents: params.verbaVariavelCents,
    parcelasComprometidasCents: parcelasComprometidas,
    verbaLivreCents: verbaLivre,
    verbaDiariaLivreCents: piso.verbaDiariaCents,
    rolloverRecebidoCents: params.rolloverRecebidoCents,
    abaixoDoPiso: piso.irreal,
  };
}

/**
 * Projeta `numCiclos` ciclos. Com `entrada.cicloCongelado`, o ciclo 1 é ele
 * mesmo — limites e verba saem do registro gravado, sem recálculo — e os
 * seguintes são derivados dele com os parâmetros vigentes. Sem ele, o ciclo 1
 * é o que contém `dataBase`.
 *
 * Projetar tudo numa passagem só é deliberado: fatiar o horizonte em dois
 * trechos calculados separadamente permitia que as âncoras de data
 * divergissem (`diaRecebimento` editado) e o mesmo intervalo fosse emitido
 * duas vezes, com a parcela contada em dobro.
 *
 * Se `entrada.cenario` estiver preenchido, as parcelas da compra hipotética
 * entram nas obrigações — use `projetarComCenario` para a comparação com a
 * linha de base.
 */
export function projetarCiclos(entrada: EntradaProjecao): CicloProjetado[] {
  if (
    !Number.isInteger(entrada.numCiclos) ||
    entrada.numCiclos < MIN_CICLOS ||
    entrada.numCiclos > MAX_CICLOS
  ) {
    throw new RangeError(
      `numCiclos inválido: ${entrada.numCiclos} (esperado inteiro entre ${MIN_CICLOS} e ${MAX_CICLOS})`,
    );
  }

  const obrigacoes: readonly ObrigacaoFutura[] = entrada.cenario
    ? [...entrada.obrigacoesFuturas, ...obrigacoesDoCenario(entrada.cenario)]
    : entrada.obrigacoesFuturas;

  // Parâmetros dos ciclos que ainda não nasceram (premissas 2 e 3).
  const poupanca = poupancaAlvoCents({
    rendaPrevistaCents: entrada.rendaPrevistaCents,
    metaPoupancaCents: entrada.metaPoupancaCents,
    metaPoupancaPercent: entrada.metaPoupancaPercent,
  });
  const provisao = provisaoMensalCents(entrada.valoresProvisaoAnualCents);

  const ciclos: CicloProjetado[] = [];
  const congelado = entrada.cicloCongelado;

  let limites: LimitesCiclo = congelado
    ? { inicio: congelado.inicio, fim: congelado.fim }
    : limitesCiclo(entrada.dataBase, entrada.diaRecebimento);

  if (congelado) {
    // Emitido tal e qual: nada aqui é recalculado a partir da Config.
    ciclos.push(
      montarCiclo({
        limites,
        rendaPrevistaCents: congelado.rendaPrevistaCents,
        poupancaAlvoCents: congelado.poupancaAlvoCents,
        fixosCents: congelado.fixosCents,
        provisaoMensalCents: congelado.provisaoMensalCents,
        verbaVariavelCents: congelado.verbaVariavelCents,
        rolloverRecebidoCents: congelado.rolloverRecebidoCents,
        obrigacoes,
        pisoDiarioVerbaCents: entrada.pisoDiarioVerbaCents,
      }),
    );
  }

  for (let k = ciclos.length; k < entrada.numCiclos; k += 1) {
    if (k > 0) {
      // Trata a transição quando `diaRecebimento` mudou depois de o ciclo
      // congelado nascer — sem isso o intervalo retrocede e se sobrepõe.
      limites = proximoCicloApos(limites.fim, entrada.diaRecebimento);
    }

    // Premissa 1: só o ciclo 1 herda rollover; sobra futura é assumida zero.
    const rolloverRecebidoCents = k === 0 ? entrada.rolloverInicialCents : 0;

    // Chamada idêntica à de `garantirCicloAtual` — SEM parâmetro de parcela.
    const verbaVariavel = verbaVariavelCents({
      rendaPrevistaCents: entrada.rendaPrevistaCents,
      poupancaAlvoCents: poupanca,
      fixosCents: entrada.fixosCents,
      provisaoMensalCents: provisao,
      rolloverRecebidoCents,
    });

    ciclos.push(
      montarCiclo({
        limites,
        rendaPrevistaCents: entrada.rendaPrevistaCents,
        poupancaAlvoCents: poupanca,
        fixosCents: entrada.fixosCents,
        provisaoMensalCents: provisao,
        verbaVariavelCents: verbaVariavel,
        rolloverRecebidoCents,
        obrigacoes,
        pisoDiarioVerbaCents: entrada.pisoDiarioVerbaCents,
      }),
    );
  }

  return ciclos;
}

/**
 * Pré-mortem de compra: projeta a linha de base e a mesma projeção com a
 * compra parcelada sobreposta, mais o delta ciclo a ciclo.
 *
 * O `delta` é sempre `comCenario − base`: negativo em `verbaLivreCents`
 * significa menos dinheiro livre.
 */
export function projetarComCenario(
  entrada: EntradaProjecao,
  cenario: CenarioHipotetico,
): ProjecaoComCenario {
  const base = projetarCiclos({ ...entrada, cenario: undefined });
  const comCenario = projetarCiclos({ ...entrada, cenario });

  const delta: DeltaCiclo[] = base.map((cicloBase, i) => {
    const cicloComCenario = comCenario[i];
    if (!cicloComCenario) {
      throw new Error('projeção com cenário devolveu menos ciclos que a base');
    }

    return {
      inicio: cicloBase.inicio,
      parcelasComprometidasCents:
        cicloComCenario.parcelasComprometidasCents - cicloBase.parcelasComprometidasCents,
      verbaLivreCents: cicloComCenario.verbaLivreCents - cicloBase.verbaLivreCents,
      verbaDiariaLivreCents: cicloComCenario.verbaDiariaLivreCents - cicloBase.verbaDiariaLivreCents,
      passouAFicarAbaixoDoPiso: cicloComCenario.abaixoDoPiso && !cicloBase.abaixoDoPiso,
    };
  });

  return { base, comCenario, delta };
}
