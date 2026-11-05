import { ErroApi, rotaEscrita } from '@/agent-api';
import { upsertProvisao } from '@/application/config';
import { excluirProvisao } from '@/application/custos';
import { provisaoAtualizarSchema, paramsIdSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

/**
 * `ativo` no corpo chega até `upsertProvisao` como qualquer outro campo —
 * mesmo efeito de `desativarProvisao`/`reativarProvisao`, um único caminho.
 */
export const PATCH = rotaEscrita(
  {
    escopo: 'write',
    body: provisaoAtualizarSchema,
    params: paramsIdSchema,
    entidade: 'ProvisaoAnual',
    acao: 'UPDATE',
  },
  async ({ deps, body, params, auditar }) => {
    const atual = await deps.provisoes.obter(params.id);
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Provisão não encontrada.');

    const { provisao, efeito } = await upsertProvisao(deps, { ...atual, ...body });
    auditar({ entidadeId: provisao.id, antes: atual, depois: provisao });
    return { provisao, efeitoNoCicloAtual: efeito };
  },
);

export const DELETE = rotaEscrita(
  { escopo: 'write', params: paramsIdSchema, entidade: 'ProvisaoAnual', acao: 'DELETE' },
  async ({ deps, params, auditar }) => {
    const atual = await deps.provisoes.obter(params.id);
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Provisão não encontrada.');

    const efeito = await excluirProvisao(deps, params.id);
    auditar({ entidadeId: params.id, antes: atual });
    return { efeitoNoCicloAtual: efeito };
  },
);
