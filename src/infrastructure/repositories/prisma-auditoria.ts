/**
 * Adapter de `AuditoriaAgentePort`. `antes`/`depois` são `Json?`: o Prisma
 * exige `Prisma.JsonNull` (não o `null` do JS) para gravar NULL num campo
 * Json — mesma ressalva de `prisma-conversa.ts`.
 */
import { Prisma, type PrismaClient, type AuditoriaAgente as PAuditoriaAgente } from '@prisma/client';
import type {
  AcaoAuditoriaAgente,
  AuditoriaAgentePort,
  FiltroAuditoriaAgente,
  NovaAuditoriaAgente,
  PaginaAuditoriaAgente,
  RegistroAuditoriaAgente,
} from '@/domain/ports/auditoria';

function paraJson(valor: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return valor == null ? Prisma.JsonNull : (valor as Prisma.InputJsonValue);
}

function paraRegistro(linha: PAuditoriaAgente): RegistroAuditoriaAgente {
  return {
    id: linha.id,
    donoId: linha.donoId,
    tokenId: linha.tokenId,
    metodo: linha.metodo,
    rota: linha.rota,
    entidade: linha.entidade,
    entidadeId: linha.entidadeId,
    acao: linha.acao as AcaoAuditoriaAgente,
    antes: linha.antes,
    depois: linha.depois,
    dryRun: linha.dryRun,
    criadoEm: linha.criadoEm,
  };
}

export class PrismaAuditoriaAgenteRepository implements AuditoriaAgentePort {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async registrar(entrada: NovaAuditoriaAgente): Promise<void> {
    await this.db.auditoriaAgente.create({
      data: {
        donoId: this.donoId,
        tokenId: entrada.tokenId,
        metodo: entrada.metodo,
        rota: entrada.rota,
        entidade: entrada.entidade,
        entidadeId: entrada.entidadeId,
        acao: entrada.acao,
        antes: paraJson(entrada.antes),
        depois: paraJson(entrada.depois),
        dryRun: entrada.dryRun,
      },
    });
  }

  async listar(filtro: FiltroAuditoriaAgente): Promise<PaginaAuditoriaAgente> {
    const where: Prisma.AuditoriaAgenteWhereInput = {
      donoId: this.donoId,
      ...(filtro.entidade ? { entidade: filtro.entidade } : {}),
      ...(filtro.acao ? { acao: filtro.acao } : {}),
      ...(filtro.tokenId ? { tokenId: filtro.tokenId } : {}),
      ...(filtro.de || filtro.ate
        ? { criadoEm: { ...(filtro.de ? { gte: filtro.de } : {}), ...(filtro.ate ? { lte: filtro.ate } : {}) } }
        : {}),
    };

    // Busca um item extra (`limite + 1`) só para saber se há próxima página,
    // sem precisar de um COUNT separado. Cursor nativo do Prisma — `id` é
    // cuid (ordenado por tempo de criação), e o desempate por `id` evita
    // ambiguidade quando duas linhas nascem no mesmo milissegundo.
    const linhas = await this.db.auditoriaAgente.findMany({
      where,
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: filtro.limite + 1,
      ...(filtro.cursor ? { cursor: { id: filtro.cursor }, skip: 1 } : {}),
    });

    const temMais = linhas.length > filtro.limite;
    const pagina = temMais ? linhas.slice(0, filtro.limite) : linhas;
    const ultimo = pagina.at(-1);

    return {
      itens: pagina.map(paraRegistro),
      proximoCursor: temMais && ultimo ? ultimo.id : null,
    };
  }
}
