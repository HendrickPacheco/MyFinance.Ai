/**
 * Read-model da tela `/projecao` (Fase 10, TASKS-CUSTOS §3.4). Deriva da
 * projeção que já existe (`obterProjecao` → `projetarCiclos`) a visão que a
 * tela consome: uma linha por ciclo, os extremos, a contagem de meses abaixo do
 * piso e a manchete.
 *
 * TRÊS COISAS QUE ESTE MÓDULO NÃO FAZ:
 *
 * 1. NÃO CALCULA. Extremos, degraus e contagens são funções puras de
 *    `src/domain/finance/projecao-resumo.ts` (CLAUDE.md regra 4). O que mora
 *    aqui é montagem de frase — apresentação, não regra.
 * 2. NÃO GRAVA (R5). `obterProjecao` lê com `obterAtual` e nunca chama
 *    `garantirCicloAtual`; abrir a tela de projeção não pode criar ciclo.
 * 3. NÃO SUBTRAI PARCELA (D-11). `verbaLivreCents` já vem do motor como
 *    `verbaVariavel − parcelasComprometidas`. Aqui ela só é copiada.
 *
 * SOBRE `totalComposicaoCents` — leia antes de desenhar a coluna empilhada.
 * A soma das cinco faixas (fixos + provisão + poupança + parcelas + verba
 * livre) vale `renda + rollover`, não `renda`. E no ciclo congelado ela pode
 * fugir das duas: depois de `puxarDaReserva` a verba GRAVADA deixa de ser a
 * soma das partes (SPEC 5.2) e é ela que vale. Por isso a linha carrega o total
 * real das faixas: é a única altura de barra que fecha em todos os ciclos.
 * Empilhar contra `rendaPrevistaCents` desenharia faixas com altura errada.
 */
import { formatarMesAno, type DataCivil } from '@/shared/data';
import { formatBRL, formatarDecimalBR } from '@/shared/dinheiro';
import {
  contarAbaixoDoPiso,
  deltasVerbaLivreCents,
  extremosDeDegrau,
  extremosVerbaLivre,
  totalComposicaoCents,
  type FimDeParcelamento,
} from '@/domain/finance';
import type { Deps } from './deps';
import { obterProjecao } from './projecao';

/** Dia (sem zero à esquerda) de uma data civil — fatiamento, nunca `new Date`. */
function diaDe(data: DataCivil): number {
  return Number(data.slice(8, 10));
}

/** Mês (1–12) de uma data civil — fatiamento, nunca `new Date`. */
function mesDe(data: DataCivil): number {
  return Number(data.slice(5, 7));
}

/**
 * Intervalo curto para desempatar dois ciclos do mesmo mês. Quando o ciclo
 * cruza a virada do mês, o dia final sozinho ficaria menor que o inicial
 * ("6–5") e leria como erro — aí o mês entra junto ("6/9–5/10").
 */
function intervaloCurto(inicio: DataCivil, fim: DataCivil): string {
  return mesDe(inicio) === mesDe(fim)
    ? `${diaDe(inicio)}–${diaDe(fim)}`
    : `${diaDe(inicio)}/${mesDe(inicio)}–${diaDe(fim)}/${mesDe(fim)}`;
}

export interface LinhaProjecao {
  inicio: DataCivil;
  fim: DataCivil;
  /** "ago/26". */
  periodoLabel: string;
  rendaPrevistaCents: number;
  fixosCents: number;
  provisaoMensalCents: number;
  poupancaAlvoCents: number;
  parcelasComprometidasCents: number;
  verbaLivreCents: number;
  /** vs. o ciclo anterior. `null` no primeiro (não há de quê comparar). */
  deltaVerbaLivreCents: number | null;
  abaixoDoPiso: boolean;
  terminamNesteCiclo: readonly FimDeParcelamento[];
  /**
   * Soma exata das cinco faixas da coluna empilhada — a altura da barra. NÃO é
   * `rendaPrevistaCents`; ver o cabeçalho deste arquivo.
   */
  totalComposicaoCents: number;
}

export interface ExtremoProjecao {
  periodoLabel: string;
  verbaLivreCents: number;
}

export interface ResumoProjecao {
  linhas: readonly LinhaProjecao[];
  minima: ExtremoProjecao;
  maxima: ExtremoProjecao;
  mesesAbaixoDoPiso: number;
  totalMeses: number;
  /** Frase pronta da manchete (§3.4). */
  manchete: string;
  premissas: readonly string[];
}

/** Horizontes oferecidos pelo seletor da tela (§3.4). */
const HORIZONTES_OFERECIDOS = [6, 12, 24] as const;

/** O próximo horizonte que o usuário pode pedir, ou `null` se já está no maior. */
function proximoHorizonte(totalMeses: number): number | null {
  return HORIZONTES_OFERECIDOS.find((h) => h > totalMeses) ?? null;
}

function linhaEm(linhas: readonly LinhaProjecao[], indice: number): LinhaProjecao {
  const linha = linhas[indice];
  if (!linha) {
    throw new RangeError(`índice de ciclo fora da projeção: ${indice}`);
  }
  return linha;
}

function extremo(linhas: readonly LinhaProjecao[], indice: number): ExtremoProjecao {
  const linha = linhaEm(linhas, indice);
  return { periodoLabel: linha.periodoLabel, verbaLivreCents: linha.verbaLivreCents };
}

/**
 * O que terminou e provocou o degrau, em texto. Cita a descrição quando é UM
 * parcelamento só e ela existe; com vários, conta quantos — listar cinco nomes
 * numa manchete deixa de ser manchete.
 */
function causaDoDegrau(terminam: readonly FimDeParcelamento[]): string {
  if (terminam.length === 0) {
    return 'sem nenhum parcelamento terminando nesse ciclo';
  }

  const unico = terminam[0];
  if (terminam.length === 1 && unico) {
    return unico.descricao
      ? `quando a última parcela de ${unico.descricao} acaba`
      : 'quando a última parcela de um parcelamento acaba';
  }
  return `quando as ${terminam.length} últimas parcelas acabam`;
}

/**
 * A frase de abertura da manchete. Cobre os quatro estados possíveis do
 * horizonte — degrau para cima, aperto, estabilidade e ciclo único — porque
 * silêncio num deles seria a tela mentindo por omissão.
 */
function fraseDeAbertura(linhas: readonly LinhaProjecao[]): string {
  if (linhas.length === 1) {
    const unica = linhaEm(linhas, 0);
    return `Só há um ciclo no horizonte (${unica.periodoLabel}): a verba livre é ${formatBRL(
      unica.verbaLivreCents,
    )}. Aumente o horizonte para comparar meses.`;
  }

  const serie = linhas.map((l) => l.verbaLivreCents);
  const { maiorAlta, maiorQueda } = extremosDeDegrau(serie);

  if (maiorAlta) {
    const chegada = linhaEm(linhas, maiorAlta.indice);
    const partida = linhaEm(linhas, maiorAlta.indice - 1);
    // A causa vem do ciclo ANTERIOR, não do de chegada: uma parcela que é a
    // última em jan/27 ainda consome verba em jan/27 — o alívio aparece em
    // fev/27. Ler `terminamNesteCiclo` do ciclo de chegada atribuiria o degrau
    // a um parcelamento que não tem nada a ver com ele.
    return `A verba livre passa de ${formatBRL(partida.verbaLivreCents)} para ${formatBRL(
      chegada.verbaLivreCents,
    )} em ${chegada.periodoLabel}, ${causaDoDegrau(partida.terminamNesteCiclo)}.`;
  }

  if (maiorQueda) {
    const piora = linhaEm(linhas, maiorQueda.indice);
    return `A verba livre não cresce no horizonte: o maior aperto é em ${
      piora.periodoLabel
    }, quando ela cai ${formatBRL(Math.abs(maiorQueda.deltaCents))}.`;
  }

  return `A verba livre fica estável em ${formatBRL(
    linhaEm(linhas, 0).verbaLivreCents,
  )} nos próximos ${linhas.length} meses.`;
}

/**
 * A frase do plano para quando nada acaba no horizonte. Dita palavra por
 * palavra em §3.4: o usuário precisa saber que o horizonte é curto demais para
 * mostrar o alívio, não que o alívio não existe.
 */
function fraseSemRespiro(linhas: readonly LinhaProjecao[]): string | null {
  const algumTermina = linhas.some((l) => l.terminamNesteCiclo.length > 0);
  if (algumTermina) return null;

  const proximo = proximoHorizonte(linhas.length);
  const abertura = `Nenhum parcelamento acaba nos próximos ${linhas.length} meses.`;
  return proximo === null
    ? abertura
    : `${abertura} Aumente para ${proximo} meses para ver o primeiro.`;
}

/** Verba livre negativa não pode ficar escondida atrás de um degrau positivo. */
function fraseVerbaNegativa(pior: LinhaProjecao): string | null {
  if (pior.verbaLivreCents >= 0) return null;
  return `Atenção: em ${pior.periodoLabel} a verba livre fica negativa (${formatBRL(
    pior.verbaLivreCents,
  )}) — as parcelas do ciclo (${formatBRL(
    pior.parcelasComprometidasCents,
  )}) passam do que sobra.`;
}

function montarManchete(linhas: readonly LinhaProjecao[], pior: LinhaProjecao): string {
  return [fraseDeAbertura(linhas), fraseSemRespiro(linhas), fraseVerbaNegativa(pior)]
    .filter((frase): frase is string => frase !== null)
    .join(' ');
}

/**
 * Resumo da projeção para a tela `/projecao`.
 *
 * @param opcoes.numCiclos Horizonte em ciclos; `projetarCiclos` valida a faixa
 *   [1, 60] e lança `RangeError` fora dela.
 * @throws {ConfigAusenteError} quando ainda não há Config gravada.
 */
export async function obterResumoProjecao(
  deps: Deps,
  opcoes: { numCiclos: number },
): Promise<ResumoProjecao> {
  const { ciclos, premissas } = await obterProjecao(deps, { numCiclos: opcoes.numCiclos });

  const deltas = deltasVerbaLivreCents(ciclos.map((c) => c.verbaLivreCents));

  // Dois ciclos podem cair no MESMO mês civil — acontece na virada de
  // `diaRecebimento`, quando nasce um ciclo-toco (ex.: 01/09–05/09 seguido de
  // 06/09–05/10, ambos "set/26"). Sem desambiguar, a tabela mostra duas linhas
  // com o mesmo nome e o eixo X do gráfico repete o rótulo — e a tabela existe
  // justamente para o dono conferir número a número contra a planilha.
  // Só desambigua quando há colisão de verdade: o caso comum não ganha ruído.
  const rotuloBase = ciclos.map((c) => formatarMesAno(c.inicio));
  const repetidos = new Set(
    rotuloBase.filter((rotulo, i) => rotuloBase.indexOf(rotulo) !== i),
  );
  const rotuloDe = (ciclo: (typeof ciclos)[number], i: number): string =>
    repetidos.has(rotuloBase[i] ?? '')
      ? `${rotuloBase[i]} (${intervaloCurto(ciclo.inicio, ciclo.fim)})`
      : (rotuloBase[i] ?? '');

  const linhas: LinhaProjecao[] = ciclos.map((ciclo, i) => ({
    inicio: ciclo.inicio,
    fim: ciclo.fim,
    periodoLabel: rotuloDe(ciclo, i),
    rendaPrevistaCents: ciclo.rendaPrevistaCents,
    fixosCents: ciclo.fixosCents,
    provisaoMensalCents: ciclo.provisaoMensalCents,
    poupancaAlvoCents: ciclo.poupancaAlvoCents,
    parcelasComprometidasCents: ciclo.parcelasComprometidasCents,
    verbaLivreCents: ciclo.verbaLivreCents,
    deltaVerbaLivreCents: deltas[i] ?? null,
    abaixoDoPiso: ciclo.abaixoDoPiso,
    terminamNesteCiclo: ciclo.terminamNesteCiclo,
    totalComposicaoCents: totalComposicaoCents(ciclo),
  }));

  const extremos = extremosVerbaLivre(linhas.map((l) => l.verbaLivreCents));
  const linhaMinima = linhaEm(linhas, extremos.minima.indice);

  return {
    linhas,
    minima: extremo(linhas, extremos.minima.indice),
    maxima: extremo(linhas, extremos.maxima.indice),
    mesesAbaixoDoPiso: contarAbaixoDoPiso(linhas.map((l) => l.abaixoDoPiso)),
    totalMeses: linhas.length,
    manchete: montarManchete(linhas, linhaMinima),
    premissas,
  };
}

/** Separador `;`: a vírgula já é o separador decimal pt-BR (ver `formatarDecimalBR`). */
const CSV_SEPARADOR = ';';
/** CRLF — o que Excel e Planilhas Google esperam num CSV. */
const CSV_QUEBRA = '\r\n';

/**
 * Marca de ordem de bytes UTF-8. Sem ela o Excel abre "Provisão" como
 * "ProvisÃ£o". Não faz parte do conteúdo: quem faz o download é que prefixa.
 */
export const CSV_BOM_UTF8 = '\uFEFF';

const CSV_CABECALHO = [
  'Mês',
  'Início',
  'Fim',
  'Renda prevista',
  'Custos fixos',
  'Provisão',
  'Poupança-alvo',
  'Parcelas',
  'Verba livre',
  'Variação da verba livre',
  'Total das faixas',
  'Abaixo do piso',
  'Termina neste ciclo',
] as const;

/**
 * Escapa uma célula segundo o RFC 4180: só quem contém separador, aspas ou
 * quebra de linha ganha aspas, e aspas internas são dobradas. Uma descrição de
 * parcelamento é texto livre do usuário — pode ter qualquer um dos três.
 */
function escaparCelula(valor: string): string {
  if (!/[";\r\n]/.test(valor)) return valor;
  return `"${valor.replace(/"/g, '""')}"`;
}

function descreverTerminos(terminam: readonly FimDeParcelamento[]): string {
  return terminam
    .map((fim) => `${fim.descricao ?? 'Parcelamento sem descrição'} (${formatBRL(fim.valorMensalCents)}/mês)`)
    .join(' · ');
}

function celulasDaLinha(linha: LinhaProjecao): string[] {
  return [
    linha.periodoLabel,
    linha.inicio,
    linha.fim,
    formatarDecimalBR(linha.rendaPrevistaCents),
    formatarDecimalBR(linha.fixosCents),
    formatarDecimalBR(linha.provisaoMensalCents),
    formatarDecimalBR(linha.poupancaAlvoCents),
    formatarDecimalBR(linha.parcelasComprometidasCents),
    formatarDecimalBR(linha.verbaLivreCents),
    // Célula VAZIA no primeiro ciclo: "0,00" afirmaria uma comparação que não
    // existe (ver `deltasVerbaLivreCents`).
    linha.deltaVerbaLivreCents === null ? '' : formatarDecimalBR(linha.deltaVerbaLivreCents),
    formatarDecimalBR(linha.totalComposicaoCents),
    linha.abaixoDoPiso ? 'sim' : 'não',
    descreverTerminos(linha.terminamNesteCiclo),
  ];
}

/**
 * Serializa as linhas da projeção em CSV pt-BR. Função PURA: devolve a string,
 * não escreve arquivo nem monta resposta HTTP — quem baixa é a rota.
 */
export function serializarProjecaoCsv(linhas: readonly LinhaProjecao[]): string {
  const registros = [[...CSV_CABECALHO], ...linhas.map(celulasDaLinha)];
  return registros
    .map((celulas) => celulas.map(escaparCelula).join(CSV_SEPARADOR))
    .join(CSV_QUEBRA);
}
