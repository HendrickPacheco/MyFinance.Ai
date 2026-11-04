import { ErroApi, rotaEscrita } from '@/agent-api';
import { upsertCustoFixo } from '@/application/config';
import { excluirCustoFixo } from '@/application/custos';
import {
  custoFixoAtualizarSchema,
  paramsIdSchema,
  vigenciaValida,
  MENSAGEM_VIGENCIA_INVALIDA,
} from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

/**
 * `ativo` no corpo chega até `upsertCustoFixo` como qualquer outro campo —
 * mesmo efeito de `desativarCustoFixo`/`reativarCustoFixo` (ambos só mudam
 * essa flag e recalculam o ciclo atual se vazio), um único caminho de escrita.
 */
export const PATCH = rotaEscrita(
  {
    escopo: 'write',
    body: custoFixoAtualizarSchema,
    params: paramsIdSchema,
    entidade: 'CustoFixo',
    acao: 'UPDATE',
  },
  async ({ deps, body, params, auditar }) => {
    const atual = await deps.custosFixos.obter(params.id);
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Custo fixo não encontrado.');

    const mesclado = { ...atual, ...body };
    if (!vigenciaValida(mesclado.vigenteDe, mesclado.vigenteAte)) {
      throw new Error(MENSAGEM_VIGENCIA_INVALIDA);
    }

    const { custo, efeito } = await upsertCustoFixo(deps, mesclado);
    auditar({ entidadeId: custo.id, antes: atual, depois: custo });
    return { custoFixo: custo, efeitoNoCicloAtual: efeito };
  },
);

export const DELETE = rotaEscrita(
  { escopo: 'write', params: paramsIdSchema, entidade: 'CustoFixo', acao: 'DELETE' },
  async ({ deps, params, auditar }) => {
    const atual = await deps.custosFixos.obter(params.id);
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Custo fixo não encontrado.');

    const efeito = await excluirCustoFixo(deps, params.id);
    auditar({ entidadeId: params.id, antes: atual });
    return { efeitoNoCicloAtual: efeito };
  },
);
