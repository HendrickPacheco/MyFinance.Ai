/**
 * Agregações de leitura para o painel desktop (dashboard). Todas as funções
 * aqui são puras e de exibição: fatiam o gasto do ciclo por categoria e por
 * método de pagamento, calculam percentuais para gráficos, projetam a sobra
 * do ciclo mantido o ritmo atual e formatam o rótulo do período. Nenhuma
 * delas participa do cálculo do teto do dia — reaproveitam a MESMA semântica
 * de `contaComoVerbaVariavel` (teto.ts) para não divergir do motor principal.
 */
import { assertData, type DataCivil } from '@/shared/data';
import type { MetodoPagamento } from '@/domain/model/enums';
import type { TransacaoCalc } from './tipos';
import type { ResultadoRitmo } from './ritmo';
import { contaComoVerbaVariavel } from './teto';

/** Nº de "décimos de percentual" que somam 100,0% (1 casa decimal). */
const DECIMOS_ALVO = 1000;

const SEM_CATEGORIA_ID = '__sem-categoria__';
const SEM_CATEGORIA_NOME = 'Sem categoria';
const CATEGORIA_REMOVIDA_NOME = 'Categoria removida';

/**
 * Rateia `valoresCents` em percentuais 0–100 (1 casa decimal) que somam
 * exatamente 100,0 sempre que a lista não é vazia e o total não é zero
 * (método do maior resto — evita que arredondamentos independentes estourem
 * ou fiquem aquém de 100%). Lista vazia devolve `[]`; total zero devolve
 * zero para todas as posições (nunca divide por zero).
 */
export function calcularPercentuais(valoresCents: readonly number[]): number[] {
  if (valoresCents.length === 0) return [];

  const total = valoresCents.reduce((soma, v) => soma + v, 0);
  if (total === 0) return valoresCents.map(() => 0);

  const brutos = valoresCents.map((v) => (v / total) * DECIMOS_ALVO);
  const bases = brutos.map((b) => Math.floor(b));
  const resultado = [...bases];

  let restante = Math.round(DECIMOS_ALVO - bases.reduce((a, b) => a + b, 0));

  if (restante > 0) {
    const ordemPorResto = brutos
      .map((b, i) => ({ i, resto: b - Math.floor(b) }))
      .sort((a, b) => b.resto - a.resto);
    for (const { i } of ordemPorResto) {
      if (restante <= 0) break;
      resultado[i] = (resultado[i] ?? 0) + 1;
      restante -= 1;
    }
  } else if (restante < 0) {
    // Drift de ponto flutuante residual: devolve o excesso tirando das
    // maiores parcelas primeiro, para preservar a ordem de grandeza.
    const ordemDecrescente = resultado
      .map((valor, i) => ({ i, valor }))
      .sort((a, b) => b.valor - a.valor);
    for (const { i } of ordemDecrescente) {
      if (restante >= 0) break;
      resultado[i] = (resultado[i] ?? 0) - 1;
      restante += 1;
    }
  }

  return resultado.map((decimos) => decimos / 10);
}

/** Progresso 0–100 (1 casa) de `realizadoCents` contra `alvoCents`. Alvo <= 0 devolve 0. */
export function percentualDeAlvo(realizadoCents: number, alvoCents: number): number {
  if (alvoCents <= 0) return 0;
  const bruto = (realizadoCents / alvoCents) * 100;
  const limitado = Math.min(Math.max(bruto, 0), 100);
  return Math.round(limitado * 10) / 10;
}

/** Forma mínima de uma transação categorizada — a mesma base do teto + categoriaId. */
export interface TransacaoCategorizada extends TransacaoCalc {
  categoriaId: string | null;
}

/** Forma mínima de uma transação para separar parcela de verba variável "solta". */
export interface TransacaoComParcela extends TransacaoCalc {
  /** Presente quando a transação é uma parcela de `Parcelamento` (SPEC 5.6). */
  parcelamentoId?: string | null;
}

/**
 * Soma o valor de todas as parcelas com competência no ciclo (regardless de
 * `hoje` — parcelamento é compromisso já assumido do mês inteiro, não gasto
 * "realizado até hoje"). Reaproveitada tanto pelos KPIs do painel quanto pela
 * tabela de parcelamentos em aberto, para as duas nunca divergirem.
 */
export function somarParceladosCents(
  transacoes: readonly Pick<TransacaoComParcela, 'valorCents' | 'parcelamentoId'>[],
): number {
  let total = 0;
  for (const t of transacoes) {
    if (t.parcelamentoId == null) continue;
    total += t.valorCents;
  }
  return total;
}

/**
 * Gasto de VERBA VARIÁVEL realizado até `ateData`, EXCLUINDO transações de
 * parcelamento. Existe porque uma parcela também é uma `Transacao` de grupo
 * VARIAVEL: se fosse somada aqui junto com `somarParceladosCents`, o "total de
 * gastos" do painel contaria a mesma parcela duas vezes (uma como parcela,
 * outra como gasto variável). `gastoRealizadoCents` (teto.ts) continua sendo a
 * fonte de verdade do TETO do dia — que legitimamente inclui parcelas, porque
 * elas consomem verba de fato. Esta função serve só ao KPI "total de gastos",
 * que já soma as parcelas separadamente.
 */
export function gastoVariavelSemParcelasCents(
  transacoes: readonly TransacaoComParcela[],
  ateData: DataCivil,
): number {
  assertData(ateData);

  let total = 0;
  for (const t of transacoes) {
    if (t.data > ateData) continue; // comparação lexicográfica (SPEC 5.1)
    if (t.parcelamentoId != null) continue; // já contado em somarParceladosCents
    if (!contaComoVerbaVariavel(t)) continue;

    if (t.tipo === 'DESPESA') total += t.valorCents;
    else if (t.tipo === 'ESTORNO') total -= t.valorCents;
  }
  return total;
}

export interface CategoriaNomeavel {
  id: string;
  nome: string;
}

export interface FatiaCategoriaAgregada {
  categoriaId: string;
  nome: string;
  totalCents: number;
  percentual: number;
}

/**
 * Agrega o gasto de VERBA VARIÁVEL do ciclo por categoria (DESPESA soma,
 * ESTORNO abate, RENDA/TRANSFERENCIA e gasto de provisão são ignorados —
 * reaproveita `contaComoVerbaVariavel`, a mesma regra de `gastoRealizadoCents`).
 * Transações sem categoria caem no bucket "Sem categoria"; categorias que
 * existiram mas foram removidas do cadastro aparecem como "Categoria removida".
 * Ordenado do maior para o menor total.
 *
 * `ateData` é OBRIGATÓRIO e, no painel, é sempre `hoje`: com o mesmo predicado
 * e o mesmo corte de `gastoRealizadoCents`, o total das fatias bate exatamente
 * com o KPI de gasto realizado — a pizza é a decomposição dele, não outro
 * número. Sem o corte, competência futura já lançada no ciclo (parcela do dia
 * 10, entrada de acordo agendada) entrava calada na fatia e fazia o gráfico
 * discordar do "Realizado até hoje" logo acima dele.
 */
export function agregarGastoPorCategoria(
  transacoes: readonly TransacaoCategorizada[],
  categorias: readonly CategoriaNomeavel[],
  ateData: DataCivil,
): FatiaCategoriaAgregada[] {
  assertData(ateData);

  const nomesPorId = new Map(categorias.map((c) => [c.id, c.nome]));
  const totaisPorId = new Map<string, number>();

  for (const t of transacoes) {
    if (t.data > ateData) continue; // comparação lexicográfica (SPEC 5.1)
    if (!contaComoVerbaVariavel(t)) continue;
    const chave = t.categoriaId ?? SEM_CATEGORIA_ID;
    const delta = t.tipo === 'DESPESA' ? t.valorCents : t.tipo === 'ESTORNO' ? -t.valorCents : 0;
    totaisPorId.set(chave, (totaisPorId.get(chave) ?? 0) + delta);
  }

  const entradas = [...totaisPorId.entries()];
  const percentuais = calcularPercentuais(entradas.map(([, totalCents]) => totalCents));

  return entradas
    .map(([categoriaId, totalCents], i) => ({
      categoriaId,
      nome:
        categoriaId === SEM_CATEGORIA_ID
          ? SEM_CATEGORIA_NOME
          : (nomesPorId.get(categoriaId) ?? CATEGORIA_REMOVIDA_NOME),
      totalCents,
      percentual: percentuais[i] ?? 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** Forma mínima de uma transação para a agregação por método de pagamento. */
export interface TransacaoComMetodo {
  tipo: TransacaoCalc['tipo'];
  valorCents: number;
  metodo: MetodoPagamento | null;
}

export interface FatiaMetodoAgregada {
  metodo: MetodoPagamento | null;
  totalCents: number;
  percentual: number;
}

/**
 * Agrega as SAÍDAS do ciclo por método de pagamento (a "tabela da planilha"):
 * DESPESA soma, ESTORNO abate, RENDA/TRANSFERENCIA ignoradas. Ao contrário da
 * fatia por categoria, aqui entra TODA saída (fixa, parcelada, de provisão ou
 * variável) — o que importa é por onde o dinheiro saiu, não o orçamento que
 * ele consome. `metodo: null` agrupa lançamentos sem método informado.
 * Ordenado do maior para o menor total.
 */
export function agregarSaidaPorMetodo(
  transacoes: readonly TransacaoComMetodo[],
): FatiaMetodoAgregada[] {
  const totaisPorMetodo = new Map<MetodoPagamento | null, number>();

  for (const t of transacoes) {
    if (t.tipo !== 'DESPESA' && t.tipo !== 'ESTORNO') continue;
    const delta = t.tipo === 'DESPESA' ? t.valorCents : -t.valorCents;
    totaisPorMetodo.set(t.metodo, (totaisPorMetodo.get(t.metodo) ?? 0) + delta);
  }

  const entradas = [...totaisPorMetodo.entries()];
  const percentuais = calcularPercentuais(entradas.map(([, totalCents]) => totalCents));

  return entradas
    .map(([metodo, totalCents], i) => ({
      metodo,
      totalCents,
      percentual: percentuais[i] ?? 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * Projeção de sobra no fim do ciclo mantido o ritmo atual: verba variável
 * menos a projeção de fechamento de `indicadoresRitmo` (ritmo.ts). Pode ser
 * negativa (projeta déficit). Arredondada para Int porque, ao contrário dos
 * indicadores de ritmo, este número é exibido como dinheiro.
 */
export function sobraProjetadaCents(params: {
  verbaVariavelCents: number;
  ritmo: Pick<ResultadoRitmo, 'projecaoFechamentoCents'>;
}): number {
  return Math.round(params.verbaVariavelCents - params.ritmo.projecaoFechamentoCents);
}

/** Forma mínima de uma transação para montar o extrato de gasto variável do ciclo. */
export interface TransacaoParaExtrato extends TransacaoComParcela {
  transacaoId: string;
  descricao: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  metodo: MetodoPagamento | null;
}

export interface LinhaTransacaoVariavelCalc {
  transacaoId: string;
  data: DataCivil;
  descricao: string | null;
  valorCents: number;
  categoriaId: string | null;
  categoriaNome: string | null;
  metodo: MetodoPagamento | null;
  /** ESTORNO abate; a UI precisa distinguir para não mostrar como despesa. */
  ehEstorno: boolean;
  /**
   * Competência ainda no futuro (`data > hoje`): já lançada no ciclo, mas
   * ainda NÃO consome verba nem entra em `gastoVariavelSemParcelasCents`. A UI
   * precisa distinguir para não somar às cegas com o realizado.
   */
  ehProgramado: boolean;
}

/**
 * Extrato do ciclo com o que é gasto variável discricionário: mesma regra de
 * `gastoVariavelSemParcelasCents` (reaproveita `contaComoVerbaVariavel` e a
 * exclusão de parcelas), mas devolvendo as linhas em vez do total — exclui
 * parcelas, gasto de provisão, RENDA e TRANSFERENCIA; inclui DESPESA e
 * ESTORNO marcando `ehEstorno`. Mais recentes primeiro.
 *
 * `hoje` separa realizado de programado (`ehProgramado`), NUNCA esconde linha:
 * por padrão o corte de inclusão é o próprio `hoje`, mas passando
 * `opcoes.ate` (tipicamente `ciclo.dataFim`) as competências futuras do ciclo
 * vêm junto, marcadas. Omiti-las era o bug: uma transação com data futura
 * ficava invisível no painel (não é fixo, não é parcela, não é provisão) e ao
 * mesmo tempo aparecia no extrato da tela Ciclo e nos gráficos de categoria/
 * método — que não filtram por data.
 */
export function extratoTransacoesVariaveis(
  transacoes: readonly TransacaoParaExtrato[],
  hoje: DataCivil,
  opcoes?: { ate?: DataCivil },
): LinhaTransacaoVariavelCalc[] {
  assertData(hoje);
  const ateData = opcoes?.ate ?? hoje;
  assertData(ateData);

  return transacoes
    .filter(
      (t) =>
        t.data <= ateData && // comparação lexicográfica (SPEC 5.1)
        t.parcelamentoId == null && // já aparece na tabela de parcelamentos
        contaComoVerbaVariavel(t) &&
        (t.tipo === 'DESPESA' || t.tipo === 'ESTORNO'),
    )
    .map((t) => ({
      transacaoId: t.transacaoId,
      data: t.data,
      descricao: t.descricao,
      valorCents: t.valorCents,
      categoriaId: t.categoriaId,
      categoriaNome: t.categoriaNome,
      metodo: t.metodo,
      ehEstorno: t.tipo === 'ESTORNO',
      ehProgramado: t.data > hoje,
    }))
    .sort((a, b) => b.data.localeCompare(a.data));
}

/**
 * Soma líquida (DESPESA − ESTORNO) só das linhas PROGRAMADAS do extrato. É um
 * número de exibição separado: nunca some com o total realizado nem com a
 * verba consumida — competência futura não consome teto (SPEC 5.1), e juntar
 * os dois num só número é exatamente o que faz o painel mentir.
 */
export function somarProgramadosCents(
  linhas: readonly Pick<LinhaTransacaoVariavelCalc, 'valorCents' | 'ehEstorno' | 'ehProgramado'>[],
): number {
  let total = 0;
  for (const l of linhas) {
    if (!l.ehProgramado) continue;
    total += l.ehEstorno ? -l.valorCents : l.valorCents;
  }
  return total;
}

export interface ResultadoPoupancaProjetada {
  poupancaProjetadaCents: number;
  progressoPercentual: number;
}

/**
 * Projeção de poupança no fechamento do ciclo: alvo + sobra PROJETADA da
 * verba variável pelo ritmo real de gasto (`sobraProjetadaCents`, acima).
 * NUNCA soma saldo-ainda-não-gasto (dinheiro que ainda pode ser gasto hoje)
 * como se já estivesse poupado — essa era a regressão original (SPEC 13): no
 * primeiro dia de um ciclo com verba positiva, o saldo bruto disponível é a
 * verba inteira, e somá-lo direto ao alvo inflava a "poupança" com dinheiro
 * que o usuário ainda tem liberdade de gastar. Usando a sobra PROJETADA (que
 * reage ao ritmo real, não ao saldo do instante), a projeção cai abaixo do
 * alvo assim que o gasto real supera o ritmo sustentável — e também quando a
 * verba já nasce negativa (fixos + poupança + provisão > renda, modo
 * recuperação, SPEC 6), mesmo sem nenhum gasto ainda registrado.
 *
 * Pode ficar negativa (a projeção pode superar o próprio alvo em módulo); não
 * há piso em zero — esconder o tamanho do déficit era exatamente o bug do
 * `Math.max(..., 0)` anterior.
 */
export function projetarPoupanca(params: {
  poupancaAlvoCents: number;
  sobraProjetadaCents: number;
}): ResultadoPoupancaProjetada {
  const poupancaProjetadaCents = params.poupancaAlvoCents + params.sobraProjetadaCents;
  return {
    poupancaProjetadaCents,
    progressoPercentual: percentualDeAlvo(poupancaProjetadaCents, params.poupancaAlvoCents),
  };
}

const MESES_ABREVIADOS_PT_BR = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

/**
 * Rótulo pt-BR do período do ciclo, ex.: "1 ago — 31 ago". Extrai dia e mês
 * por fatiamento de string (nunca `new Date(string)`) para não correr risco
 * do bug de fuso horário na comparação/formatação de datas civis (SPEC 5.1).
 */
export function formatarPeriodoCiclo(inicio: DataCivil, fim: DataCivil): string {
  assertData(inicio, 'inicio');
  assertData(fim, 'fim');

  const rotuloDeData = (data: DataCivil): string => {
    const dia = Number(data.slice(8, 10));
    const mesIndice = Number(data.slice(5, 7)) - 1;
    return `${dia} ${MESES_ABREVIADOS_PT_BR[mesIndice]}`;
  };

  return `${rotuloDeData(inicio)} — ${rotuloDeData(fim)}`;
}
