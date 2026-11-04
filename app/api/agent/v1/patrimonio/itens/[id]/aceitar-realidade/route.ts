import { ErroApi, rotaEscrita } from '@/agent-api';
import { aceitarRealidade } from '@/application/patrimonio';
import { paramsIdSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

/**
 * Move `Conta.saldoCents` até o valor que o último snapshot registrou para
 * este item — SEM criar `Transacao` (D-13: razão e realidade são conciliadas,
 * nunca sincronizadas em silêncio; só esta ação explícita escreve).
 */
export const POST = rotaEscrita(
  { escopo: 'write', params: paramsIdSchema, entidade: 'ItemPatrimonio', acao: 'UPDATE' },
  async ({ deps, params, auditar }) => {
    const snapshot = await deps.patrimonio.ultimoSnapshot();
    const item = snapshot?.itens.find((i) => i.id === params.id) ?? null;
    if (!item) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Item de patrimônio não encontrado.');

    const contaAntes = item.contaId ? await deps.contas.obter(item.contaId) : null;
    await aceitarRealidade(deps, params.id);
    const contaDepois = item.contaId ? await deps.contas.obter(item.contaId) : null;

    auditar({ entidadeId: params.id, antes: contaAntes, depois: contaDepois });
    return { item, conta: contaDepois };
  },
);
