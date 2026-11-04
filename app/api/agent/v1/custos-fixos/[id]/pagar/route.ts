import { z } from 'zod';
import { ErroApi, rotaEscrita } from '@/agent-api';
import { marcarCustoFixoPago, desmarcarCustoFixoPago } from '@/application/pagamentos';
import { paramsIdSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

/**
 * `marcarCustoFixoPago`/`desmarcarCustoFixoPago` (`src/application/pagamentos.ts`)
 * só aceitam o CICLO ATUAL (`garantirCicloAtual` por dentro) — não há
 * parâmetro `cicloId`/data/valor no caso de uso. Por isso este endpoint não
 * declara `body`: qualquer `cicloId` enviado pelo agente é ignorado, nunca
 * validado como se fosse aceito. Ver lacuna no relatório final do grupo
 * cadastros.
 */
export const POST = rotaEscrita(
  { escopo: 'write', params: paramsIdSchema, entidade: 'PagamentoFixo', acao: 'ACTION', status: 201 },
  async ({ deps, params, auditar }) => {
    const atual = await deps.custosFixos.obter(params.id);
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Custo fixo não encontrado.');

    await marcarCustoFixoPago(deps, params.id);
    auditar({ entidadeId: params.id, antes: { pago: false }, depois: { pago: true } });
    return { ok: true };
  },
);

const queryCicloIdSchema = z.object({ cicloId: z.string().optional() });

export const DELETE = rotaEscrita(
  {
    escopo: 'write',
    params: paramsIdSchema,
    query: queryCicloIdSchema,
    entidade: 'PagamentoFixo',
    acao: 'ACTION',
  },
  async ({ deps, params, auditar }) => {
    const atual = await deps.custosFixos.obter(params.id);
    if (!atual) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Custo fixo não encontrado.');

    await desmarcarCustoFixoPago(deps, params.id);
    auditar({ entidadeId: params.id, antes: { pago: true }, depois: { pago: false } });
    return { ok: true };
  },
);
