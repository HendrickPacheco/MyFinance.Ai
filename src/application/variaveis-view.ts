/**
 * Read-model de `/custos/variaveis` (TASKS-CUSTOS Fase 9): o extrato de gastos
 * variáveis num recorte de PERÍODO, não de ciclo, com filtros de categoria e
 * método.
 *
 * Só orquestração — nenhum cálculo mora aqui (CLAUDE.md regra 4). Quem decide
 * o que é gasto variável é `extratoTransacoesVariaveis`, a MESMA função pura
 * que monta o extrato do painel desktop, que por sua vez aplica
 * `contaComoVerbaVariavel` de `teto.ts`. Consequência direta da regra R4 do
 * plano: parcela (`parcelamentoId != null`) e gasto de provisão
 * (`provisaoId != null`) não aparecem nesta lista nem neste total, porque não
 * consomem verba variável (D-11 / regra 5). Reimplementar o critério aqui
 * seria criar um segundo "o que é gasto variável" capaz de divergir do teto
 * diário — exatamente o bug que a regra 4 existe para impedir.
 *
 * Duas consultas de tamanho fixo (`listarPorIntervalo` + `listar` categorias),
 * nunca uma por linha.
 */
import { addDias, addMeses, type DataCivil } from '@/shared/data';
import { METODO_PAGAMENTO, type MetodoPagamento } from '@/domain/model/enums';
import {
  extratoTransacoesVariaveis,
  filtrarLinhasVariaveis,
  formatarPeriodoCiclo,
  somarProgramadosCents,
  somarRealizadosCents,
  type TransacaoParaExtrato,
} from '@/domain/finance';
import type { Deps } from './deps';
import type { LinhaTransacaoVariavel, OpcaoCategoria } from './dashboard-tipos';
import { lerCicloAtual } from './ciclos';

const FORMATO_DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

/** Atalhos de período. O valor vive na URL; nunca em `useState` (§3.1/§3.4). */
export const PRESETS_PERIODO = ['ciclo', '3m', '6m', '12m'] as const;
export type PresetPeriodo = (typeof PRESETS_PERIODO)[number];

export const LABEL_PRESET: Record<PresetPeriodo, string> = {
  ciclo: 'Ciclo atual',
  '3m': '3 meses',
  '6m': '6 meses',
  '12m': '12 meses',
};

export interface FiltroVariaveis {
  de: DataCivil;
  ate: DataCivil;
  /** `null` = todas as categorias. */
  categoriaId: string | null;
  /** `null` = todos os métodos. */
  metodo: MetodoPagamento | null;
}

/** `searchParams` do App Router, já resolvido. */
export type ParamsVariaveis = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

function dataValida(valor: string | null): DataCivil | null {
  return valor !== null && FORMATO_DATA_CIVIL.test(valor) ? valor : null;
}

function metodoValido(valor: string | null): MetodoPagamento | null {
  return METODO_PAGAMENTO.find((m) => m === valor) ?? null;
}

/**
 * Lê o filtro da URL. Nunca lança: parâmetro malformado (URL colada torta,
 * link antigo) cai no padrão em vez de derrubar a página com 500 — a tela é
 * de leitura, e um `de=xx` inválido não é motivo para o dono perder o acesso
 * ao próprio extrato.
 *
 * `de > ate` é invertido em vez de descartado: quem digitou as duas datas
 * quis aquele intervalo, só o informou ao contrário.
 */
export function parsearFiltroVariaveis(
  params: ParamsVariaveis,
  padrao: { de: DataCivil; ate: DataCivil },
): FiltroVariaveis {
  const de = dataValida(primeiro(params.de)) ?? padrao.de;
  const ate = dataValida(primeiro(params.ate)) ?? padrao.ate;
  const categoriaId = primeiro(params.categoria);

  return {
    de: de <= ate ? de : ate, // comparação lexicográfica (regra 2)
    ate: de <= ate ? ate : de,
    categoriaId: categoriaId !== null && categoriaId !== '' ? categoriaId : null,
    metodo: metodoValido(primeiro(params.metodo)),
  };
}

/**
 * Intervalo de cada atalho, a partir do ciclo atual e de "hoje".
 *
 * "3 meses" termina no FIM DO CICLO, não em hoje: gasto de competência futura
 * já lançado dentro do ciclo existe (é o `ehProgramado`), e cortar em hoje o
 * faria sumir da tela que existe justamente para gerenciá-lo.
 */
export function intervalosPreset(
  ciclo: { inicio: DataCivil; fim: DataCivil },
): Record<PresetPeriodo, { de: DataCivil; ate: DataCivil }> {
  return {
    ciclo: { de: ciclo.inicio, ate: ciclo.fim },
    '3m': { de: addMeses(ciclo.inicio, -2), ate: ciclo.fim },
    '6m': { de: addMeses(ciclo.inicio, -5), ate: ciclo.fim },
    '12m': { de: addMeses(ciclo.inicio, -11), ate: ciclo.fim },
  };
}

export interface EstadoVariaveis {
  filtro: FiltroVariaveis;
  /** "1 jun — 31 ago". */
  periodoLabel: string;
  linhas: readonly LinhaTransacaoVariavel[];
  /** Soma líquida do recorte JÁ realizado. Sempre visível na tela. */
  totalCents: number;
  /** Soma líquida só das linhas de competência futura. Nunca somada ao total. */
  programadasCents: number;
  /** Quantas linhas o recorte devolveu — o dono confere contra a lista. */
  quantidade: number;
  /** Categorias do grupo VARIAVEL, para o filtro e para a edição inline. */
  categorias: readonly OpcaoCategoria[];
  metodos: readonly MetodoPagamento[];
  presets: Record<PresetPeriodo, { de: DataCivil; ate: DataCivil }>;
}

export async function obterEstadoVariaveis(
  deps: Deps,
  params: ParamsVariaveis,
): Promise<EstadoVariaveis> {
  const hoje = deps.relogio.hoje();
  const resolvido = await lerCicloAtual(deps);

  // Sem ciclo aberto o padrão é o mês corrente terminando hoje: a tela precisa
  // abrir mostrando algo real, e criar ciclo num read-model é proibido (R5).
  const cicloRef = resolvido
    ? { inicio: resolvido.ciclo.dataInicio, fim: resolvido.ciclo.dataFim }
    : { inicio: addDias(addMeses(hoje, -1), 1), fim: hoje };

  const presets = intervalosPreset(cicloRef);
  const filtro = parsearFiltroVariaveis(params, presets.ciclo);

  const [transacoes, categorias] = await Promise.all([
    deps.transacoes.listarPorIntervalo(filtro.de, filtro.ate),
    deps.categorias.listar(),
  ]);

  const grupoPorCategoria = new Map(categorias.map((c) => [c.id, c.grupo]));
  const nomePorCategoria = new Map(categorias.map((c) => [c.id, c.nome]));

  const paraExtrato: TransacaoParaExtrato[] = transacoes.map((t) => ({
    transacaoId: t.id,
    data: t.data,
    valorCents: t.valorCents,
    tipo: t.tipo,
    grupoCategoria: t.categoriaId ? (grupoPorCategoria.get(t.categoriaId) ?? null) : null,
    provisaoId: t.provisaoId,
    parcelamentoId: t.parcelamentoId,
    descricao: t.descricao,
    categoriaId: t.categoriaId,
    categoriaNome: t.categoriaId ? (nomePorCategoria.get(t.categoriaId) ?? null) : null,
    metodo: t.metodo,
  }));

  const linhas = filtrarLinhasVariaveis(
    extratoTransacoesVariaveis(paraExtrato, hoje, { ate: filtro.ate }),
    filtro,
  );

  return {
    filtro,
    periodoLabel: formatarPeriodoCiclo(filtro.de, filtro.ate),
    linhas,
    totalCents: somarRealizadosCents(linhas),
    programadasCents: somarProgramadosCents(linhas),
    quantidade: linhas.length,
    categorias: categorias
      .filter((c) => c.grupo === 'VARIAVEL')
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo })),
    metodos: METODO_PAGAMENTO,
    presets,
  };
}
