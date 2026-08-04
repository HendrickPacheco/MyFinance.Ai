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
import { recalcularCicloAtualSeVazio } from './ciclos';

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

export async function upsertCustoFixo(deps: Deps, custo: CustoFixo): Promise<CustoFixo> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const salvo = await deps.custosFixos.salvar(custo);
  await recalcularCicloAtualSeVazio(deps);
  return salvo;
}

export async function upsertProvisao(deps: Deps, provisao: ProvisaoAnual): Promise<ProvisaoAnual> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  const salvo = await deps.provisoes.salvar(provisao);
  await recalcularCicloAtualSeVazio(deps);
  return salvo;
}

export async function upsertCategoria(deps: Deps, categoria: Categoria): Promise<Categoria> {
  // Autorização (TASKS-AUTH §2.3): primeira linha, antes de qualquer I/O.
  exigirOwner(deps.ator);

  return deps.categorias.salvar(categoria);
}
