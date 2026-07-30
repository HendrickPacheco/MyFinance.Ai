/**
 * Casos de uso de Configuração (SPEC 7, 8). Editar Config NÃO recalcula o
 * ciclo atual (congelado); vale para o próximo. A ação de recalcular é
 * separada e explícita (ver ciclos.recalcularCicloAtual).
 */
import type { Deps } from './deps';
import type {
  Config,
  Conta,
  Categoria,
  CustoFixo,
  ProvisaoAnual,
} from '@/domain/model/entidades';
import { recalcularCicloAtualSeVazio } from './ciclos';

export interface EstadoConfig {
  config: Config;
  contas: Conta[];
  custosFixos: CustoFixo[];
  provisoes: ProvisaoAnual[];
  categorias: Categoria[];
  fixosTotalCents: number;
  provisaoMensalCents: number;
}

export async function obterEstadoConfig(deps: Deps): Promise<EstadoConfig> {
  const [config, contas, custosFixos, provisoes, categorias] = await Promise.all([
    deps.config.obter(),
    deps.contas.listar({ incluirArquivadas: true }),
    deps.custosFixos.listarAtivos(),
    deps.provisoes.listarAtivas(),
    deps.categorias.listar(),
  ]);
  if (!config) throw new Error('Configuração não encontrada.');

  const fixosTotalCents = custosFixos.reduce((s, c) => s + c.valorCents, 0);
  const provisaoMensalCents = Math.floor(
    provisoes.reduce((s, p) => s + p.valorAnualCents, 0) / 12,
  );

  return { config, contas, custosFixos, provisoes, categorias, fixosTotalCents, provisaoMensalCents };
}

export type ConfigInput = Omit<Config, 'id'>;

export async function atualizarConfig(deps: Deps, input: ConfigInput): Promise<Config> {
  const config = await deps.config.salvar({ id: 1, ...input });
  await recalcularCicloAtualSeVazio(deps);
  return config;
}

export async function upsertConta(deps: Deps, conta: Conta): Promise<Conta> {
  return deps.contas.salvar(conta);
}

export async function upsertCustoFixo(deps: Deps, custo: CustoFixo): Promise<CustoFixo> {
  const salvo = await deps.custosFixos.salvar(custo);
  await recalcularCicloAtualSeVazio(deps);
  return salvo;
}

export async function upsertProvisao(deps: Deps, provisao: ProvisaoAnual): Promise<ProvisaoAnual> {
  const salvo = await deps.provisoes.salvar(provisao);
  await recalcularCicloAtualSeVazio(deps);
  return salvo;
}

export async function upsertCategoria(deps: Deps, categoria: Categoria): Promise<Categoria> {
  return deps.categorias.salvar(categoria);
}
