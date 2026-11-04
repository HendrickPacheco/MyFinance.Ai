import { ErroApi, rotaEscrita } from '@/agent-api';
import { aprovarImportacaoBodySchema, importacaoIdParamsSchema } from '@/agent-api/schemas/importacao-admin';
import {
  confirmarItemImportado,
  descartarItemImportado,
  finalizarImportacao,
  ImportacaoInexistenteError,
  ItemImportadoInexistenteError,
  type ResultadoConfirmacao,
  type ResultadoFinalizacao,
} from '@/application/importacao/confirmar';

export const dynamic = 'force-dynamic';

/**
 * `ImportacaoInexistenteError`/`ItemImportadoInexistenteError` não seguem a
 * convenção `*NaoEncontradoError` que o mapeador genérico do kernel
 * reconhece (`src/agent-api/erros.ts`) — nasceram antes da API do agente
 * existir, e renomeá-las agora mudaria a mensagem que `src/actions/importacao.ts`
 * já devolve à UI. Mais barato traduzir aqui, na borda HTTP, do que mexer num
 * nome usado por outra superfície.
 */
function paraErroApi(erro: unknown): unknown {
  if (erro instanceof ImportacaoInexistenteError || erro instanceof ItemImportadoInexistenteError) {
    return new ErroApi(404, 'NAO_ENCONTRADO', erro.message);
  }
  return erro;
}

/**
 * Aprova/descarta linhas de UM rascunho e, opcionalmente, finaliza a
 * importação — tudo dentro da MESMA transação que `rotaEscrita` já abre
 * (ou tudo comita, ou nada comita). D-18 continua valendo aqui: cada item
 * de `itens` é uma decisão INDIVIDUAL (`confirmarItemImportado`), só o
 * transporte HTTP é em lote. `aprovarImportacaoBodySchema` já garante que o
 * corpo não está vazio e que nenhum `itemId` está em `itens` e `descartar`
 * ao mesmo tempo.
 */
export const POST = rotaEscrita(
  {
    escopo: 'write',
    body: aprovarImportacaoBodySchema,
    params: importacaoIdParamsSchema,
    entidade: 'ItemImportado',
    acao: 'UPDATE',
  },
  async ({ deps, params, body, auditar }) => {
    const { itens, descartar } = body;

    try {
      const resultados: { itemId: string; resultado: ResultadoConfirmacao }[] = [];
      for (const item of itens) {
        const resultado = await confirmarItemImportado(deps, {
          importacaoId: params.id,
          itemId: item.itemId,
          ajustes: item.ajustes,
          confirmarRetroativo: item.confirmarRetroativo,
          escolhaAmbigua: item.escolhaAmbigua,
        });
        auditar({ entidadeId: item.itemId, depois: resultado });
        resultados.push({ itemId: item.itemId, resultado });
      }

      for (const itemId of descartar) {
        await descartarItemImportado(deps, { importacaoId: params.id, itemId });
        auditar({ entidadeId: itemId, depois: { status: 'DESCARTADA' } });
      }

      let finalizacao: ResultadoFinalizacao | null = null;
      if (body.finalizar) {
        finalizacao = await finalizarImportacao(deps, params.id);
        auditar({ entidade: 'Importacao', entidadeId: params.id, acao: 'ACTION', depois: finalizacao });
      }

      return { resultados, descartados: descartar, finalizacao };
    } catch (erro) {
      throw paraErroApi(erro);
    }
  },
);
