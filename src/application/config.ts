/**
 * Casos de uso de Configuração (SPEC 7, 8). Editar Config NÃO recalcula o
 * ciclo atual (congelado); vale para o próximo. A ação de recalcular é
 * separada e explícita (ver ciclos.recalcularCicloAtual).
 */
import type { Deps } from './deps';
import { exigirOwner } from '@/domain/auth/permissoes';
import type {
  Config,
  Conta,
  Categoria,
  CustoFixo,
  ProvisaoAnual,
} from '@/domain/model/entidades';
import {
  limitesCiclo,
  diasTotaisCiclo,
  poupancaAlvoCents,
  verbaVariavelCents,
  verificarMetaIrreal,
  sugerirRendaPrevistaCents,
  sugerirMetaPoupancaCents,
  rendaLiquidaPrevista,
  mediaPoupancaReal,
  type RendaLiquida,
  type VerificacaoMetaIrreal,
} from '@/domain/finance';
import { obterCotacaoUsd } from './cotacao';
import { recalcularCicloAtualSeVazio, type EfeitoNoCicloAtual } from './ciclos';
import { validarCategoriaDeCustoFixo } from './categoria-custo-fixo';

/** Nº de ciclos fechados consultados para as sugestões da regra 6 (renda variável). */
const JANELA_CICLOS_SUGESTAO_RENDA = 6;

export interface EstadoConfig {
  config: Config;
  contas: Conta[];
  custosFixos: CustoFixo[];
  provisoes: ProvisaoAnual[];
  categorias: Categoria[];
  fixosTotalCents: number;
  provisaoMensalCents: number;
  /** Regra 6: menor renda realizada nos últimos ciclos fechados; `null` sem histórico suficiente. */
  sugestaoRendaVariavelCents: number | null;
  /** Regra 12: meta de poupança comprovadamente sustentável; `null` sem evidência dupla de folga. */
  sugestaoMetaPoupancaCents: number | null;
  /** Regra 12: se a verba diária prevista para o próximo ciclo fica abaixo do piso configurado. */
  avisoMetaIrreal: VerificacaoMetaIrreal;
  /** Média da poupança REAL dos 3 últimos fechados; `null` se algum dos 3 não foi medido. */
  sugestaoMetaPorPoupancaReal: { mediaCents: number; ciclos: 3 } | null;
  /** Decomposição USD→BRL da config SALVA; `null` quando a renda é em reais. */
  rendaPrevistaUsd: RendaLiquida | null;
  avisoCotacao: string | null;
}

export async function obterEstadoConfig(deps: Deps): Promise<EstadoConfig> {
  const [config, contas, custosFixos, provisoes, categorias, ultimosFechados] = await Promise.all([
    deps.config.obter(),
    deps.contas.listar({ incluirArquivadas: true }),
    deps.custosFixos.listarAtivos(),
    deps.provisoes.listarAtivas(),
    deps.categorias.listar(),
    deps.ciclos.ultimosFechados(JANELA_CICLOS_SUGESTAO_RENDA),
  ]);
  if (!config) throw new Error('Configuração não encontrada.');

  const fixosTotalCents = custosFixos.reduce((s, c) => s + c.valorCents, 0);
  const provisaoMensalCents = Math.floor(
    provisoes.reduce((s, p) => s + p.valorAnualCents, 0) / 12,
  );

  const poupancaPrevistaCents = poupancaAlvoCents({
    rendaPrevistaCents: config.rendaBaseCents,
    metaPoupancaCents: config.metaPoupancaCents,
    metaPoupancaPercent: config.metaPoupancaPercent,
  });
  const verbaPrevistaCents = verbaVariavelCents({
    rendaPrevistaCents: config.rendaBaseCents,
    fixosCents: fixosTotalCents,
    provisaoMensalCents,
  });
  const diasCicloPrevisto = diasTotaisCiclo(limitesCiclo(deps.relogio.hoje(), config.diaRecebimento));

  const avisoMetaIrreal = verificarMetaIrreal({
    verbaVariavelCents: verbaPrevistaCents,
    poupancaAlvoCents: poupancaPrevistaCents,
    diasCiclo: diasCicloPrevisto,
    pisoDiarioCents: config.pisoDiarioVerbaCents,
  });

  const rendasRealizadasCents = ultimosFechados
    .map((c) => c.rendaRealizadaCents)
    .filter((v): v is number => v != null);
  const sugestaoRendaVariavelCents = sugerirRendaPrevistaCents(rendasRealizadasCents);

  const sugestaoMetaPoupancaCents = sugerirMetaPoupancaCents(
    ultimosFechados.map((c) => ({
      poupancaAlvoCents: c.poupancaAlvoCents,
      sobraCents: c.sobraCents,
    })),
  );

  const real = mediaPoupancaReal(ultimosFechados, 3);
  const sugestaoMetaPorPoupancaReal =
    real.ciclosConsiderados === 3 && real.mediaCents != null
      ? { mediaCents: real.mediaCents, ciclos: 3 as const }
      : null;

  let rendaPrevistaUsd: RendaLiquida | null = null;
  let avisoCotacao: string | null = null;
  if (config.moedaRenda === 'USD') {
    const { cotacao, aviso } = await obterCotacaoUsd(deps);
    rendaPrevistaUsd = rendaLiquidaPrevista(config, cotacao);
    avisoCotacao = aviso;
  }

  return {
    config,
    contas,
    custosFixos,
    provisoes,
    categorias,
    fixosTotalCents,
    provisaoMensalCents,
    sugestaoRendaVariavelCents,
    sugestaoMetaPoupancaCents,
    avisoMetaIrreal,
    sugestaoMetaPorPoupancaReal,
    rendaPrevistaUsd,
    avisoCotacao,
  };
}

const CAMPOS_RENDA_MOEDA = [
  'moedaRenda',
  'rendaBrutaMoedaOrigemCents',
  'impostoEstimadoCents',
  'impostoEstimadoPercentual',
  'fonteRenda',
] as const;

/**
 * Os campos de renda em moeda de origem são opcionais: quem não os informa
 * (a tela de Config atual) PRESERVA o que já está gravado, em vez de zerá-los.
 */
export type ConfigInput = Omit<Config, 'id' | (typeof CAMPOS_RENDA_MOEDA)[number]> &
  Partial<Pick<Config, (typeof CAMPOS_RENDA_MOEDA)[number]>>;

export interface ResultadoAtualizarConfig {
  config: Config;
  efeito: EfeitoNoCicloAtual;
}

/**
 * Devolve também `efeito` (D-15 — número derivado viaja com suas partes):
 * `recalcularCicloAtualSeVazio` já calcula o impacto no ciclo em curso, e
 * descartá-lo aqui faria quem chama perguntar de novo por uma consulta que
 * já tinha a resposta. A Server Action (`src/actions/config.ts`) ignora
 * `efeito` de propósito — comportamento inalterado — enquanto a API do
 * agente o expõe na resposta.
 */
export async function atualizarConfig(
  deps: Deps,
  input: ConfigInput,
): Promise<ResultadoAtualizarConfig> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const atual = await deps.config.obter();
  const preservados = {
    moedaRenda: atual?.moedaRenda ?? 'BRL',
    rendaBrutaMoedaOrigemCents: atual?.rendaBrutaMoedaOrigemCents ?? null,
    impostoEstimadoCents: atual?.impostoEstimadoCents ?? null,
    impostoEstimadoPercentual: atual?.impostoEstimadoPercentual ?? null,
    fonteRenda: atual?.fonteRenda ?? null,
  };
  const nova: Config = { id: 1, ...preservados, ...input };
  if (nova.impostoEstimadoCents != null && nova.impostoEstimadoPercentual != null) {
    throw new RangeError('Informe imposto fixo OU percentual, não os dois');
  }
  // Renda em USD: `rendaBaseCents` passa a guardar a líquida em reais derivada,
  // para os leitores legados (onboarding, projeção) seguirem corretos.
  if (nova.moedaRenda === 'USD') {
    const { cotacao } = await obterCotacaoUsd(deps);
    nova.rendaBaseCents = rendaLiquidaPrevista(nova, cotacao).liquidaCents;
  }
  const config = await deps.config.salvar(nova);
  const efeito = await recalcularCicloAtualSeVazio(deps);
  return { config, efeito };
}

export async function upsertConta(deps: Deps, conta: Conta): Promise<Conta> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  return deps.contas.salvar(conta);
}

/**
 * Salvar um custo fixo/provisão devolve o cadastro E o efeito no ciclo em
 * curso. O efeito não é enfeite: `recalcularCicloAtualSeVazio` recalcula a
 * verba de hoje quando o ciclo ainda não tem lançamento, e sem esse retorno a
 * UI só saberia dizer "vale a partir do próximo ciclo" — falso justamente no
 * dia 1, que é quando o dono mexe nos custos (TASKS-CUSTOS §4.3 item 0).
 */
export interface ResultadoUpsertCustoFixo {
  custo: CustoFixo;
  efeito: EfeitoNoCicloAtual;
}

export interface ResultadoUpsertProvisao {
  provisao: ProvisaoAnual;
  efeito: EfeitoNoCicloAtual;
}

export async function upsertCustoFixo(
  deps: Deps,
  custo: CustoFixo,
): Promise<ResultadoUpsertCustoFixo> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  // `categoriaId` é o único campo aqui cujo valor é um ID VINDO DA TELA. A FK
  // criada na G0 confere que ele existe, não que ele é do mesmo dono — quem
  // fecha isso é o guard (TASKS-GRAFO §7.2).
  await validarCategoriaDeCustoFixo(deps, custo.categoriaId);

  const salvo = await deps.custosFixos.salvar(custo);
  return { custo: salvo, efeito: await recalcularCicloAtualSeVazio(deps) };
}

export async function upsertProvisao(
  deps: Deps,
  provisao: ProvisaoAnual,
): Promise<ResultadoUpsertProvisao> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const salvo = await deps.provisoes.salvar(provisao);
  return { provisao: salvo, efeito: await recalcularCicloAtualSeVazio(deps) };
}

export async function upsertCategoria(
  deps: Deps,
  categoria: Omit<Categoria, 'tipoVerba'> & { tipoVerba?: Categoria['tipoVerba'] },
): Promise<Categoria> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  // Sem `tipoVerba` informado, edição preserva o atual; criação nasce EXTRA.
  const tipoVerba =
    categoria.tipoVerba ??
    (categoria.id ? (await deps.categorias.obter(categoria.id))?.tipoVerba : undefined) ??
    'EXTRA';
  return deps.categorias.salvar({ ...categoria, tipoVerba });
}
