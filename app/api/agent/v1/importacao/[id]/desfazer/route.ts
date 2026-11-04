import { ErroApi, rotaEscrita } from '@/agent-api';
import { desfazerImportacaoBodySchema, importacaoIdParamsSchema } from '@/agent-api/schemas/importacao-admin';
import { desfazerImportacao, ImportacaoInexistenteError } from '@/application/importacao/desfazer';

export const dynamic = 'force-dynamic';

export const POST = rotaEscrita(
  {
    escopo: 'write',
    body: desfazerImportacaoBodySchema,
    params: importacaoIdParamsSchema,
    entidade: 'Importacao',
    acao: 'DELETE',
  },
  async ({ deps, params, body, auditar }) => {
    try {
      const resultado = await desfazerImportacao(deps, params.id, body.confirmarRetroativo ?? false);
      auditar({ entidadeId: params.id, depois: resultado });
      return { resultado };
    } catch (erro) {
      // `ImportacaoInexistenteError` não segue a convenção `*NaoEncontradoError`
      // que o mapeador genérico do kernel reconhece (nasceu antes da API do
      // agente existir) — traduzida aqui, na borda HTTP.
      if (erro instanceof ImportacaoInexistenteError) {
        throw new ErroApi(404, 'NAO_ENCONTRADO', erro.message);
      }
      throw erro;
    }
  },
);
