import { rotaAgente, rotaEscrita } from '@/agent-api';
import { upsertCustoFixo } from '@/application/config';
import { obterEstadoCustosFixos } from '@/application/custos-view';
import { custoFixoCriarSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

/**
 * Reusa o MESMO read-model da tela `/custos` (regra 4 do CLAUDE.md): cada
 * linha já traz `ciclosComPagamento` (status de pagamento no ciclo atual) e
 * `categoriaNome` resolvidos em consultas agregadas, sem N+1.
 */
export const GET = rotaAgente({ escopo: 'read' }, async ({ deps }) => {
  const estado = await obterEstadoCustosFixos(deps);
  return {
    custosFixos: estado.linhas.map((linha) => ({
      ...linha.custo,
      ciclosComPagamento: linha.ciclosComPagamento,
      categoriaNome: linha.categoriaNome,
    })),
    previaRecalculoCicloAtual: estado.previaRecalculo,
  };
});

export const POST = rotaEscrita(
  { escopo: 'write', body: custoFixoCriarSchema, entidade: 'CustoFixo', acao: 'CREATE', status: 201 },
  async ({ deps, body, auditar }) => {
    const { custo, efeito } = await upsertCustoFixo(deps, {
      id: '',
      nome: body.nome,
      valorCents: body.valorCents,
      diaVencimento: body.diaVencimento,
      ativo: body.ativo ?? true,
      contaId: body.contaId ?? null,
      categoriaId: body.categoriaId ?? null,
      vigenteDe: body.vigenteDe ?? null,
      vigenteAte: body.vigenteAte ?? null,
    });
    auditar({ entidadeId: custo.id, depois: custo });
    return { custoFixo: custo, efeitoNoCicloAtual: efeito };
  },
);
