import { ErroApi, rotaAgente, rotaEscrita } from '@/agent-api';
import { atualizarConfig, obterEstadoConfig } from '@/application/config';
import { configAtualizarSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read' }, async ({ deps }) => {
  return obterEstadoConfig(deps);
});

/**
 * Config é singleton (id fixo 1): o PATCH funde o corpo parcial com a Config
 * atual e passa o objeto completo para `atualizarConfig`, que segue a MESMA
 * semântica da Server Action — editar afeta o PRÓXIMO ciclo (verba congelada,
 * regra 3 do CLAUDE.md), exceto quando `recalcularCicloAtualSeVazio` recalcula
 * o ciclo em curso por ele ainda não ter lançamento (D-15: `efeitoNoCicloAtual`
 * na resposta diz exatamente o que aconteceu).
 */
export const PATCH = rotaEscrita(
  { escopo: 'admin', body: configAtualizarSchema, entidade: 'Config', acao: 'UPDATE' },
  async ({ deps, body, auditar }) => {
    const atual = await deps.config.obter();
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Configuração não encontrada.');

    const { id: _id, ...mesclado } = { ...atual, ...body };
    const { config, efeito } = await atualizarConfig(deps, mesclado);
    auditar({ entidadeId: String(config.id), antes: atual, depois: config });
    return { config, efeitoNoCicloAtual: efeito };
  },
);
