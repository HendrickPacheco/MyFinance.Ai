import { ErroApi, rotaEscrita } from '@/agent-api';
import { upsertCategoria } from '@/application/config';
import { categoriaAtualizarSchema, paramsIdSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

/**
 * "Excluir" categoria não existe: o modelo (`Categoria`) não tem flag de
 * arquivamento/ativo — ver relatório final do grupo cadastros. Este PATCH é
 * o único caminho de escrita sobre um cadastro existente.
 */
export const PATCH = rotaEscrita(
  {
    escopo: 'write',
    body: categoriaAtualizarSchema,
    params: paramsIdSchema,
    entidade: 'Categoria',
    acao: 'UPDATE',
  },
  async ({ deps, body, params, auditar }) => {
    const atual = await deps.categorias.obter(params.id);
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Categoria não encontrada.');

    const categoria = await upsertCategoria(deps, { ...atual, ...body });
    auditar({ entidadeId: categoria.id, antes: atual, depois: categoria });
    return { categoria };
  },
);
