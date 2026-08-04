/**
 * Read-model da projeção (Fase C, tarefa C4). Monta a entrada de
 * `projetarCiclos` a partir do banco e chama o motor. NENHUM cálculo mora
 * aqui (CLAUDE.md regra 4) — só leitura, montagem e orquestração.
 *
 * DUAS DECISÕES QUE VALEM LER ANTES DE MEXER:
 *
 * 1. CONGELAMENTO (SPEC 5.2). O ciclo ATUAL usa os parâmetros congelados no
 *    registro `Ciclo` — renda, poupança-alvo, fixos, provisão e rollover como
 *    estavam quando ele nasceu. Os ciclos FUTUROS usam a `Config` vigente,
 *    porque é ela que valerá quando eles nascerem. Confundir as duas coisas
 *    faria a projeção mostrar um ciclo atual que não existe: editar a Config
 *    hoje mudaria retroativamente o mês em curso.
 *
 *    Por isso a projeção é montada em DOIS segmentos (congelado + vigente) e
 *    concatenada. Concatenar não é calcular.
 *
 * 2. READ-ONLY DE VERDADE. Este módulo NÃO chama `garantirCicloAtual`, que
 *    cria o ciclo quando ele não existe. O copiloto vai chamar isto para
 *    responder pergunta, e uma pergunta não pode gravar no banco como efeito
 *    colateral. Lê com `obterAtual`; se não há ciclo, projeta tudo a partir da
 *    Config e diz isso em `premissas`.
 */
import { addDias, addMeses, type DataCivil } from '@/shared/data';
import { somaCents } from '@/shared/dinheiro';
import { limitesCiclo, projetarCiclos, projetarComCenario } from '@/domain/finance';
import type {
  CenarioHipotetico,
  CicloCongelado,
  CicloProjetado,
  DeltaCiclo,
  EntradaProjecao,
  ObrigacaoFutura,
} from '@/domain/finance';
import type { Ciclo, Config } from '@/domain/model/entidades';
import { ConfigAusenteError } from './ciclos';
import type { Deps } from './deps';

export interface ResultadoProjecao {
  ciclos: readonly CicloProjetado[];
  /** Preenchido só quando um cenário hipotético foi pedido. */
  cenario: { ciclos: readonly CicloProjetado[]; delta: readonly DeltaCiclo[] } | null;
  /** Premissas em linguagem natural — o copiloto precisa poder declará-las. */
  premissas: readonly string[];
}

const PREMISSAS_BASE = [
  'Sobra zero nos ciclos futuros: a projeção não adivinha quanto você vai gastar.',
  'Custo fixo constante em todo o horizonte — o cadastro não tem data de término.',
  'Renda prevista constante e igual à da configuração vigente.',
] as const;

/** Parâmetros vigentes na Config, para os ciclos que ainda não nasceram. */
async function parametrosVigentes(
  deps: Deps,
  config: Config,
): Promise<
  Pick<
    EntradaProjecao,
    | 'rendaPrevistaCents'
    | 'metaPoupancaCents'
    | 'metaPoupancaPercent'
    | 'fixosCents'
    | 'valoresProvisaoAnualCents'
  >
> {
  const [custos, provisoes] = await Promise.all([
    deps.custosFixos.listarAtivos(),
    deps.provisoes.listarAtivas(),
  ]);

  return {
    rendaPrevistaCents: config.rendaBaseCents,
    metaPoupancaCents: config.metaPoupancaCents,
    metaPoupancaPercent: config.metaPoupancaPercent,
    fixosCents: somaCents(custos.map((c) => c.valorCents)),
    valoresProvisaoAnualCents: provisoes.map((p) => p.valorAnualCents),
  };
}

/**
 * O ciclo atual como está gravado. Cópia direta, sem recálculo: limites e
 * verba saem do registro, porque é o registro que o usuário vê na tela Hoje.
 */
function congelar(ciclo: Ciclo): CicloCongelado {
  return {
    inicio: ciclo.dataInicio,
    fim: ciclo.dataFim,
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    fixosCents: ciclo.fixosCents,
    provisaoMensalCents: ciclo.provisaoMensalCents,
    verbaVariavelCents: ciclo.verbaVariavelCents,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
  };
}

/** Parcelas já gravadas que caem no horizonte. Fonte de verdade = `Transacao`. */
async function obrigacoesFuturas(
  deps: Deps,
  inicio: DataCivil,
  fim: DataCivil,
): Promise<ObrigacaoFutura[]> {
  const transacoes = await deps.transacoes.listarPorIntervalo(inicio, fim);

  return transacoes
    .filter((t) => t.parcelamentoId != null)
    .map((t) => ({
      data: t.data,
      valorCents: t.valorCents,
      parcelamentoId: t.parcelamentoId,
    }));
}

/**
 * Projeta `numCiclos` ciclos a partir de hoje. Com `cenario`, devolve também a
 * projeção com a compra parcelada sobreposta e o delta ciclo a ciclo.
 */
export async function obterProjecao(
  deps: Deps,
  opcoes: { numCiclos: number; cenario?: CenarioHipotetico },
): Promise<ResultadoProjecao> {
  const config = await deps.config.obter();
  if (!config) throw new ConfigAusenteError();

  const hoje = deps.relogio.hoje();
  const cicloAtual = await deps.ciclos.obterAtual(hoje);
  const congelado = cicloAtual ? congelar(cicloAtual) : undefined;

  // A janela começa no INÍCIO do ciclo 1, não em `hoje`: a verba do ciclo é a
  // do ciclo inteiro, então as parcelas dele também têm que ser as do ciclo
  // inteiro. Consultar a partir de hoje esconderia as parcelas já vencidas no
  // mês corrente e inflaria `verbaLivreCents`.
  const inicioJanela = congelado?.inicio ?? limitesCiclo(hoje, config.diaRecebimento).inicio;
  // Limite superior generoso: um ciclo dura no máximo ~31 dias, então
  // `numCiclos` ciclos terminam dentro de `numCiclos + 1` meses. O que sobrar
  // fora do horizonte é descartado pelo próprio motor.
  const obrigacoes = await obrigacoesFuturas(
    deps,
    inicioJanela,
    addMeses(inicioJanela, opcoes.numCiclos + 1),
  );

  const entrada: EntradaProjecao = {
    ...(await parametrosVigentes(deps, config)),
    dataBase: hoje,
    cicloCongelado: congelado,
    numCiclos: opcoes.numCiclos,
    diaRecebimento: config.diaRecebimento,
    destinoSobra: config.destinoSobra,
    pisoDiarioVerbaCents: config.pisoDiarioVerbaCents,
    rolloverInicialCents: 0,
    obrigacoesFuturas: obrigacoes,
  };

  const premissas: string[] = [...PREMISSAS_BASE];
  premissas.push(
    congelado
      ? 'O ciclo atual usa os parâmetros congelados quando ele nasceu; os seguintes usam a configuração vigente.'
      : 'Ainda não há ciclo aberto: todos os ciclos usam a configuração vigente.',
  );

  if (!opcoes.cenario) {
    return { ciclos: projetarCiclos(entrada), cenario: null, premissas };
  }

  const { base, comCenario, delta } = projetarComCenario(entrada, opcoes.cenario);
  return { ciclos: base, cenario: { ciclos: comCenario, delta }, premissas };
}
