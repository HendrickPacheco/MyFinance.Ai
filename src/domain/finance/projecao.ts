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
import { addDias, estaNoIntervalo } from '@/shared/data';
import { somaCents } from '@/shared/dinheiro';
import { diasTotaisCiclo, limitesCiclo } from './ciclo';
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

/**
 * Projeta `numCiclos` ciclos a partir de `dataBase`. O ciclo 1 é o que contém
 * `dataBase`. Se `entrada.cenario` estiver preenchido, as parcelas da compra
 * hipotética entram nas obrigações — use `projetarComCenario` quando quiser a
 * comparação com a linha de base.
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

  // Constantes ao longo do horizonte (premissas 2 e 3).
  const poupanca = poupancaAlvoCents({
    rendaPrevistaCents: entrada.rendaPrevistaCents,
    metaPoupancaCents: entrada.metaPoupancaCents,
    metaPoupancaPercent: entrada.metaPoupancaPercent,
  });
  const provisao = provisaoMensalCents(entrada.valoresProvisaoAnualCents);

  const ciclos: CicloProjetado[] = [];
  let limites = limitesCiclo(entrada.dataBase, entrada.diaRecebimento);

  for (let k = 0; k < entrada.numCiclos; k += 1) {
    if (k > 0) {
      // O ciclo seguinte começa no dia após o fim do anterior.
      limites = limitesCiclo(addDias(limites.fim, 1), entrada.diaRecebimento);
    }

    const diasTotais = diasTotaisCiclo(limites);

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

    // Somado DEPOIS e à parte — parcela nunca entra no cálculo da verba.
    const parcelasComprometidas = somaCents(
      obrigacoes
        .filter((o) => estaNoIntervalo(o.data, limites.inicio, limites.fim))
        .map((o) => o.valorCents),
    );

    const verbaLivre = verbaVariavel - parcelasComprometidas;

    // Avaliado sobre a verba LIVRE: sobre a bruta esconderia o aperto da parcela.
    // Reusa a divisão do motor em vez de repeti-la aqui.
    const piso = verificarMetaIrreal({
      verbaVariavelCents: verbaLivre,
      diasCiclo: diasTotais,
      pisoDiarioCents: entrada.pisoDiarioVerbaCents,
    });

    ciclos.push({
      inicio: limites.inicio,
      fim: limites.fim,
      diasTotais,
      rendaPrevistaCents: entrada.rendaPrevistaCents,
      poupancaAlvoCents: poupanca,
      fixosCents: entrada.fixosCents,
      provisaoMensalCents: provisao,
      verbaVariavelCents: verbaVariavel,
      parcelasComprometidasCents: parcelasComprometidas,
      verbaLivreCents: verbaLivre,
      verbaDiariaLivreCents: piso.verbaDiariaCents,
      rolloverRecebidoCents,
      abaixoDoPiso: piso.irreal,
    });
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
