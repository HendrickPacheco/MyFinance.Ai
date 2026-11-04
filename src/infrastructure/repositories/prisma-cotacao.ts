import type { PrismaClient } from '@prisma/client';
import type { Cotacao } from '@/domain/model/entidades';
import type { FonteCotacao } from '@/domain/model/enums';
import type { CotacaoRepository } from '@/domain/ports/cotacao';
import type { DataCivil } from '@/shared/data';

// SEM donoId, de propósito (D4): cotação é dado público, igual para todos os donos.
const PAR = { moedaOrigem: 'USD', moedaDestino: 'BRL' } as const;

function paraDominio(l: { data: string; taxaMicros: number; fonte: string }): Cotacao {
  return { ...PAR, data: l.data, taxaMicros: l.taxaMicros, fonte: l.fonte as FonteCotacao };
}

export class PrismaCotacaoRepository implements CotacaoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async obter(data: DataCivil): Promise<Cotacao | null> {
    const l = await this.prisma.cotacao.findFirst({ where: { data, ...PAR } });
    return l ? paraDominio(l) : null;
  }

  async ultimaAte(data: DataCivil): Promise<Cotacao | null> {
    const l = await this.prisma.cotacao.findFirst({
      where: { data: { lte: data }, ...PAR },
      orderBy: { data: 'desc' },
    });
    return l ? paraDominio(l) : null;
  }

  async salvar(c: Cotacao): Promise<Cotacao> {
    const l = await this.prisma.cotacao.upsert({
      where: { data_moedaOrigem_moedaDestino: { data: c.data, ...PAR } },
      create: { data: c.data, ...PAR, taxaMicros: c.taxaMicros, fonte: c.fonte },
      update: { taxaMicros: c.taxaMicros, fonte: c.fonte },
    });
    return paraDominio(l);
  }
}
