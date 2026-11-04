import { rotaEscrita } from '@/agent-api';
import { criarSnapshot } from '@/application/patrimonio';
import { patrimonioSnapshotCriarSchema } from '@/agent-api/schemas/cadastros';

export const dynamic = 'force-dynamic';

export const POST = rotaEscrita(
  {
    escopo: 'write',
    body: patrimonioSnapshotCriarSchema,
    entidade: 'SnapshotPatrimonio',
    acao: 'CREATE',
    status: 201,
  },
  async ({ deps, body, auditar }) => {
    const itens = body.itens.map((item) => ({ ...item, contaId: item.contaId ?? null }));
    const snapshot = await criarSnapshot(deps, body.data, itens);
    auditar({ entidadeId: snapshot.id, depois: snapshot });
    return { snapshot };
  },
);
