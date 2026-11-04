/**
 * Adapter de `IdempotenciaPort`. `resposta` é `Json` NOT NULL — ao contrário
 * de `prisma-auditoria.ts`, nunca precisa de `Prisma.JsonNull`: a resposta de
 * uma escrita bem-sucedida sempre existe.
 */
import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  type IdempotenciaPort,
  type NovoRegistroIdempotencia,
  type RegistroIdempotenciaSalvo,
} from '@/domain/ports/idempotencia';

export class PrismaIdempotenciaAgenteRepository implements IdempotenciaPort {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async buscar(chave: string): Promise<RegistroIdempotenciaSalvo | null> {
    const linha = await this.db.idempotenciaAgente.findUnique({
      where: { donoId_chave: { donoId: this.donoId, chave } },
    });
    if (!linha) return null;
    return { statusHttp: linha.statusHttp, resposta: linha.resposta, hashCorpo: linha.hashCorpo };
  }

  async salvar(registro: NovoRegistroIdempotencia): Promise<void> {
    await this.db.idempotenciaAgente.create({
      data: {
        donoId: this.donoId,
        tokenId: registro.tokenId,
        metodo: registro.metodo,
        rota: registro.rota,
        chave: registro.chave,
        hashCorpo: registro.hashCorpo,
        statusHttp: registro.statusHttp,
        resposta: registro.resposta as Prisma.InputJsonValue,
        expiraEm: registro.expiraEm,
      },
    });
    // Higiene oportunista: só no caminho de escrita (nunca no de leitura),
    // para não pagar o custo de um DELETE em toda consulta de replay.
    await this.removerExpiradas(new Date());
  }

  async removerExpiradas(agora: Date): Promise<void> {
    await this.db.idempotenciaAgente.deleteMany({
      where: { donoId: this.donoId, expiraEm: { lt: agora } },
    });
  }
}
