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
  type VerificacaoMetaIrreal,
} from '@/domain/finance';
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
    poupancaAlvoCents: poupancaPrevistaCents,
    fixosCents: fixosTotalCents,
    provisaoMensalCents,
  });
  const diasCicloPrevisto = diasTotaisCiclo(limitesCiclo(deps.relogio.hoje(), config.diaRecebimento));

  const avisoMetaIrreal = verificarMetaIrreal({
    verbaVariavelCents: verbaPrevistaCents,
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
  };
}

export type ConfigInput = Omit<Config, 'id'>;

export async function atualizarConfig(deps: Deps, input: ConfigInput): Promise<Config> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const config = await deps.config.salvar({ id: 1, ...input });
  await recalcularCicloAtualSeVazio(deps);
  return config;
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

export async function upsertCategoria(deps: Deps, categoria: Categoria): Promise<Categoria> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  return deps.categorias.salvar(categoria);
}
