/**
 * Motor de cálculo do Histórico (`/historico`, SPEC 7): achata uma lista de
 * ciclos FECHADOS num retrato mês a mês, com série cronológica para gráfico e
 * tabela do mais novo para o mais antigo. Função pura, sem I/O — a leitura de
 * ciclo/transação/patrimônio é responsabilidade de `application/historico.ts`.
 *
 * Reaproveita as mesmas primitivas do painel desktop (`agregacoes.ts`) para
 * nunca divergir do motor principal: `somarParceladosCents` e
 * `gastoVariavelSemParcelasCents` já respeitam `contaComoVerbaVariavel`
 * (exclusão de `provisaoId` e tratamento de ESTORNO). A única diferença é o
 * corte de data — aqui é sempre `dataFim` do próprio ciclo (fechado), nunca
 * `hoje`.
 *
 * ── A armadilha do custo fixo (tabela do CLAUDE.md) ───────────────────────
 * `fixosCents`, `provisaoCents`, `poupancaAlvoCents`, `verbaVariavelCents` e
 * `rolloverRecebidoCents` chegam CONGELADOS em `CicloHistoricoInput` — lidos
 * do `Ciclo` como está gravado, nunca recompostos a partir de transação ou da
 * Config atual. Custo fixo não cria `Transacao`; somar isso por cima do
 * congelado duplicaria o dinheiro.
 */
import { gastoVariavelSemParcelasCents, somarParceladosCents } from './agregacoes';
import { formatarMesAno } from '@/shared/data';
import type { DataCivil } from '@/shared/data';
import type { TransacaoCalc } from './tipos';

/** Forma mínima de uma transação do ciclo para este cálculo. */
export interface LancamentoHistorico extends TransacaoCalc {
  /** Presente quando a transação é uma parcela de `Parcelamento` (SPEC 5.6). */
  parcelamentoId?: string | null;
}

/** Por que `patrimonioFimCents`/`variacaoPatrimonioCents` vieram `null` (decisão D-14). */
const MOTIVOS = {
  SEM_SNAPSHOT_ATE_DATA:
    'Não há snapshot de patrimônio registrado até o fim deste ciclo.',
  PRIMEIRO_MES_DA_SERIE:
    'Este é o primeiro mês do histórico consultado — não há mês anterior para comparar.',
  MES_ANTERIOR_SEM_SNAPSHOT:
    'O mês anterior da série não tem snapshot de patrimônio registrado até o fim dele, então a variação não pode ser calculada.',
} as const;

export interface CicloHistoricoInput {
  cicloId: string;
  dataInicio: DataCivil;
  dataFim: DataCivil;
  rendaPrevistaCents: number;
  rendaRealizadaCents: number | null;
  fixosCents: number;
  provisaoMensalCents: number;
  poupancaAlvoCents: number;
  verbaVariavelCents: number;
  rolloverRecebidoCents: number;
  sobraCents: number | null;
  /** Transações do ciclo, já mapeadas para cálculo. */
  lancamentos: readonly LancamentoHistorico[];
  /** Total do snapshot de patrimônio mais recente com data <= dataFim, ou null. */
  patrimonioFimCents: number | null;
}

/**
 * Um ciclo fechado, achatado para uma linha de tabela e um ponto de gráfico.
 *
 * Esta é a forma que a tela consome: `application/historico-tipos.ts` só a
 * reexporta. Um dia ela foi declarada duas vezes (aqui e lá), e as duas
 * cópias só ficavam iguais por disciplina — bastava um campo novo de um lado
 * para o cast entre elas passar a mentir.
 */
export interface MesHistorico {
  cicloId: string;
  dataInicio: DataCivil;
  dataFim: DataCivil;
  /** Rótulo curto do eixo e da linha: "ago/26". */
  rotulo: string;

  // ── Entradas ────────────────────────────────────────────────────────────
  /** Congelada quando o ciclo nasceu. */
  rendaPrevistaCents: number;
  /** Input do dono no fechamento. `null` se o ciclo fechou sem informá-la. */
  rendaRealizadaCents: number | null;
  /** `rendaRealizadaCents ?? rendaPrevistaCents` — a base de todo percentual. */
  rendaConsideradaCents: number;
  /**
   * Transações tipo RENDA lançadas dentro do ciclo (extra, bônus, reembolso).
   * Campo SEPARADO de propósito: a renda do ciclo é declarada, não somada de
   * transações (decisão do fechamento), e juntar as duas contaria salário
   * duas vezes em quem lança o próprio salário como transação.
   */
  entradasExtraCents: number;

  // ── Saídas (os três caminhos da tabela do CLAUDE.md) ────────────────────
  /**
   * Congelado no ciclo. NÃO sai de transação — custo fixo não cria uma.
   * Somar transação de categoria FIXO por cima disto conta o mesmo dinheiro
   * duas vezes (risco R1: R$ 4.884/mês em duplicidade).
   */
  fixosCents: number;
  /** Parcelas com competência no ciclo (`Transacao.parcelamentoId != null`). */
  parceladosCents: number;
  /** Gasto variável do ciclo, sem parcelas e sem `provisaoId`. */
  variavelCents: number;
  /** `fixosCents + parceladosCents + variavelCents`. */
  gastoTotalCents: number;

  // ── Reservado (nunca somado a gasto — regra 5) ──────────────────────────
  /** Congelada no ciclo. Dinheiro guardado. */
  provisaoCents: number;
  poupancaAlvoCents: number;
  /** Verba variável GRAVADA. Fonte de verdade, não recomposta pelas partes. */
  verbaVariavelCents: number;
  /** Sobra apurada no fechamento (pode ser negativa). `null` se não apurada. */
  sobraCents: number | null;
  /** Sobra (±) herdada do ciclo anterior, quando `destinoSobra = ROLLOVER`. */
  rolloverRecebidoCents: number;

  // ── Patrimônio ──────────────────────────────────────────────────────────
  /**
   * Total do snapshot de patrimônio mais recente com data <= `dataFim`.
   * `null` quando não existe snapshot até o fim do mês.
   */
  patrimonioFimCents: number | null;
  /** Diferença para o `patrimonioFimCents` do mês anterior da série. */
  variacaoPatrimonioCents: number | null;
  /**
   * Por que falta número (D-14). Preenchido quando `patrimonioFimCents` OU
   * `variacaoPatrimonioCents` vem `null` — um `null` mudo faz o copiloto (e o
   * dono) inventar a causa.
   */
  motivoPatrimonioAusente: string | null;
}

/** Somas e médias da janela inteira — o rodapé da tabela. */
export interface TotaisHistorico {
  meses: number;
  rendaCents: number;
  gastoTotalCents: number;
  fixosCents: number;
  parceladosCents: number;
  variavelCents: number;
  poupancaAlvoCents: number;
  /** Média por mês do gasto total. `0` quando não há mês nenhum. */
  gastoMedioCents: number;
  rendaMediaCents: number;
}

export interface EstadoHistorico {
  /** Do mais NOVO para o mais antigo (ordem de leitura da tabela). */
  meses: readonly MesHistorico[];
  /** Do mais ANTIGO para o mais novo (ordem do eixo x dos gráficos). */
  serie: readonly MesHistorico[];
  totais: TotaisHistorico;
}

function montarMes(ciclo: CicloHistoricoInput, anteriorPatrimonioFimCents: number | null, ehPrimeiro: boolean): MesHistorico {
  const parceladosCents = somarParceladosCents(ciclo.lancamentos);
  const variavelCents = gastoVariavelSemParcelasCents(ciclo.lancamentos, ciclo.dataFim);
  const entradasExtraCents = ciclo.lancamentos.reduce(
    (soma, l) => (l.tipo === 'RENDA' ? soma + l.valorCents : soma),
    0,
  );
  const rendaConsideradaCents = ciclo.rendaRealizadaCents ?? ciclo.rendaPrevistaCents;
  const gastoTotalCents = ciclo.fixosCents + parceladosCents + variavelCents;

  const patrimonioFimCents = ciclo.patrimonioFimCents;
  let variacaoPatrimonioCents: number | null = null;
  let motivoPatrimonioAusente: string | null = null;

  if (patrimonioFimCents === null) {
    motivoPatrimonioAusente = MOTIVOS.SEM_SNAPSHOT_ATE_DATA;
  } else if (ehPrimeiro) {
    motivoPatrimonioAusente = MOTIVOS.PRIMEIRO_MES_DA_SERIE;
  } else if (anteriorPatrimonioFimCents === null) {
    motivoPatrimonioAusente = MOTIVOS.MES_ANTERIOR_SEM_SNAPSHOT;
  } else {
    variacaoPatrimonioCents = patrimonioFimCents - anteriorPatrimonioFimCents;
  }

  return {
    cicloId: ciclo.cicloId,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
    rotulo: formatarMesAno(ciclo.dataInicio),
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    rendaRealizadaCents: ciclo.rendaRealizadaCents,
    rendaConsideradaCents,
    entradasExtraCents,
    fixosCents: ciclo.fixosCents,
    parceladosCents,
    variavelCents,
    gastoTotalCents,
    provisaoCents: ciclo.provisaoMensalCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    verbaVariavelCents: ciclo.verbaVariavelCents,
    sobraCents: ciclo.sobraCents,
    rolloverRecebidoCents: ciclo.rolloverRecebidoCents,
    patrimonioFimCents,
    variacaoPatrimonioCents,
    motivoPatrimonioAusente,
  };
}

/** Média inteira por `Math.floor`, coerente com a regra de rateio do projeto (`floor` + resto). Zero itens devolve 0. */
function mediaCents(somaCents: number, quantidade: number): number {
  return quantidade === 0 ? 0 : Math.floor(somaCents / quantidade);
}

export function montarHistorico(ciclos: readonly CicloHistoricoInput[]): EstadoHistorico {
  const ordenados = [...ciclos].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));

  const serie: MesHistorico[] = ordenados.map((ciclo, i) => {
    const anterior = i > 0 ? (ordenados[i - 1]?.patrimonioFimCents ?? null) : null;
    return montarMes(ciclo, anterior, i === 0);
  });

  const totalRendaCents = serie.reduce((s, m) => s + m.rendaConsideradaCents, 0);
  const totalGastoCents = serie.reduce((s, m) => s + m.gastoTotalCents, 0);
  const totalFixosCents = serie.reduce((s, m) => s + m.fixosCents, 0);
  const totalParceladosCents = serie.reduce((s, m) => s + m.parceladosCents, 0);
  const totalVariavelCents = serie.reduce((s, m) => s + m.variavelCents, 0);
  const totalPoupancaAlvoCents = serie.reduce((s, m) => s + m.poupancaAlvoCents, 0);

  return {
    serie,
    meses: [...serie].reverse(),
    totais: {
      meses: serie.length,
      rendaCents: totalRendaCents,
      gastoTotalCents: totalGastoCents,
      fixosCents: totalFixosCents,
      parceladosCents: totalParceladosCents,
      variavelCents: totalVariavelCents,
      poupancaAlvoCents: totalPoupancaAlvoCents,
      gastoMedioCents: mediaCents(totalGastoCents, serie.length),
      rendaMediaCents: mediaCents(totalRendaCents, serie.length),
    },
  };
}
