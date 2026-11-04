import { rotaAgente, rotaEscrita } from '@/agent-api';
import { upsertConta } from '@/application/config';
import { contaCriarSchema, contasQuerySchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

/** `Conta.saldoCents` já é o saldo — nenhuma consulta extra para "com saldos". */
export const GET = rotaAgente(
  { escopo: 'read', query: contasQuerySchema },
  async ({ deps, query }) => {
    const contas = await deps.contas.listar({ incluirArquivadas: query.incluirArquivadas === 'true' });
    return { contas };
  },
);

export const POST = rotaEscrita(
  { escopo: 'write', body: contaCriarSchema, entidade: 'Conta', acao: 'CREATE', status: 201 },
  async ({ deps, body, auditar }) => {
    const conta = await upsertConta(deps, {
      id: '',
      nome: body.nome,
      tipo: body.tipo,
      saldoCents: body.saldoCents ?? 0,
      incluiPatrimonio: body.incluiPatrimonio ?? true,
      arquivada: body.arquivada ?? false,
    });
    auditar({ entidadeId: conta.id, depois: conta });
    return { conta };
  },
);
