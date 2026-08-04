/**
 * Contador durável de uso da IA. Postgres, não memória: um teto de gasto que
 * some no restart não é um teto (TASKS-AUTH §6).
 */
import type { PrismaClient } from '@prisma/client';
import type { DataCivil } from '@/shared/data';
import type { UsoIADia, UsoIARepository } from '@/domain/ports/uso-ia';

const ZERADO: UsoIADia = { requisicoes: 0, tokensEntrada: 0, tokensSaida: 0 };

export class PrismaUsoIARepository implements UsoIARepository {
  constructor(private readonly prisma: PrismaClient) {}

  async doDia(dia: DataCivil): Promise<UsoIADia> {
    const linha = await this.prisma.usoIA.findUnique({ where: { dia } });
    if (!linha) return { ...ZERADO };
    return {
      requisicoes: linha.requisicoes,
      tokensEntrada: linha.tokensEntrada,
      tokensSaida: linha.tokensSaida,
    };
  }

  async incrementar(dia: DataCivil, uso: UsoIADia): Promise<void> {
    // `upsert` com `increment` faz a soma no banco, não em memória: duas
    // chamadas concorrentes não perdem contagem (o que, num teto de gasto,
    // seria uma perda a favor do atacante).
    await this.prisma.usoIA.upsert({
      where: { dia },
      create: {
        dia,
        requisicoes: uso.requisicoes,
        tokensEntrada: uso.tokensEntrada,
        tokensSaida: uso.tokensSaida,
      },
      update: {
        requisicoes: { increment: uso.requisicoes },
        tokensEntrada: { increment: uso.tokensEntrada },
        tokensSaida: { increment: uso.tokensSaida },
      },
    });
  }
}
