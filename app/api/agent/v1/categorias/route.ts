import { rotaAgente, rotaEscrita } from '@/agent-api';
import { upsertCategoria } from '@/application/config';
import { categoriaCriarSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read' }, async ({ deps }) => {
  const categorias = await deps.categorias.listar();
  return { categorias };
});

export const POST = rotaEscrita(
  { escopo: 'write', body: categoriaCriarSchema, entidade: 'Categoria', acao: 'CREATE', status: 201 },
  async ({ deps, body, auditar }) => {
    const categoria = await upsertCategoria(deps, {
      id: '',
      nome: body.nome,
      grupo: body.grupo,
      essencial: body.essencial ?? false,
      icone: body.icone ?? null,
      cor: body.cor ?? null,
      ordem: body.ordem ?? 0,
    });
    auditar({ entidadeId: categoria.id, depois: categoria });
    return { categoria };
  },
);
