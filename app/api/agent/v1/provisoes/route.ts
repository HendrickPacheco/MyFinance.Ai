import { rotaAgente, rotaEscrita } from '@/agent-api';
import { upsertProvisao } from '@/application/config';
import { listarProvisoes } from '@/application/custos';
import { provisaoCriarSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

export const GET = rotaAgente({ escopo: 'read' }, async ({ deps }) => {
  const provisoes = await listarProvisoes(deps);
  return { provisoes };
});

export const POST = rotaEscrita(
  { escopo: 'write', body: provisaoCriarSchema, entidade: 'ProvisaoAnual', acao: 'CREATE', status: 201 },
  async ({ deps, body, auditar }) => {
    const { provisao, efeito } = await upsertProvisao(deps, {
      id: '',
      nome: body.nome,
      valorAnualCents: body.valorAnualCents,
      mesEsperado: body.mesEsperado ?? null,
      acumuladoCents: body.acumuladoCents ?? 0,
      ativo: body.ativo ?? true,
    });
    auditar({ entidadeId: provisao.id, depois: provisao });
    return { provisao, efeitoNoCicloAtual: efeito };
  },
);
