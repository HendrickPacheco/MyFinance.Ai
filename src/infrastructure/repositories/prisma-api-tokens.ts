/**
 * Adapter de `ApiTokenRepository` (API do agente de IA, v1).
 *
 * Mesma regra de ouro do multi-tenant das demais tabelas financeiras: leitura
 * por id usa `findFirst({ id, donoId })`, escrita por id usa `updateMany`
 * com `{ id, donoId }`. A ÚNICA exceção documentada é
 * `buscarPorHashParaAutenticar` — ver a porta (`domain/ports/api-tokens.ts`)
 * para o motivo.
 */
import type { ApiToken as PApiToken, PrismaClient } from '@prisma/client';
import type { EscopoAgente } from '@/domain/auth/api-token';
import {
  ApiTokenNaoEncontradoError,
  type ApiTokenRegistro,
  type ApiTokenRepository,
  type NovoApiToken,
} from '@/domain/ports/api-tokens';

function paraRegistro(linha: PApiToken): ApiTokenRegistro {
  return {
    id: linha.id,
    donoId: linha.donoId,
    nome: linha.nome,
    prefixo: linha.prefixo,
    hash: linha.hash,
    // `escopos` é `String[]` no banco (sem enum nativo no Postgres) — valor
    // desconhecido aqui seria token corrompido na mão, nunca escrito pela
    // própria `criarToken`; filtrar em vez de lançar falha fechada (um
    // escopo que a leitura não reconhece simplesmente não concede nada).
    escopos: linha.escopos.filter(ehEscopoValido),
    criadoEm: linha.criadoEm,
    ultimoUsoEm: linha.ultimoUsoEm,
    expiraEm: linha.expiraEm,
    revogadoEm: linha.revogadoEm,
  };
}

function ehEscopoValido(valor: string): valor is EscopoAgente {
  return valor === 'read' || valor === 'write' || valor === 'admin';
}

export class PrismaApiTokenRepository implements ApiTokenRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async criar(dados: NovoApiToken): Promise<ApiTokenRegistro> {
    const criado = await this.db.apiToken.create({
      data: {
        donoId: this.donoId,
        nome: dados.nome,
        prefixo: dados.prefixo,
        hash: dados.hash,
        escopos: [...dados.escopos],
        expiraEm: dados.expiraEm,
      },
    });
    return paraRegistro(criado);
  }

  async listar(): Promise<ApiTokenRegistro[]> {
    const linhas = await this.db.apiToken.findMany({
      where: { donoId: this.donoId },
      orderBy: { criadoEm: 'desc' },
    });
    return linhas.map(paraRegistro);
  }

  async revogar(id: string, revogadoEm: Date): Promise<void> {
    const { count } = await this.db.apiToken.updateMany({
      where: { id, donoId: this.donoId },
      data: { revogadoEm },
    });
    if (count === 0) throw new ApiTokenNaoEncontradoError();
  }

  async marcarUsoAgora(id: string, usadoEm: Date): Promise<void> {
    await this.db.apiToken.updateMany({
      where: { id, donoId: this.donoId },
      data: { ultimoUsoEm: usadoEm },
    });
  }

  /**
   * NÃO filtra por `this.donoId` — ver `ApiTokenRepository.buscarPorHashParaAutenticar`.
   * `hash` é `@unique` no banco: no máximo uma linha, qualquer que seja o dono.
   */
  async buscarPorHashParaAutenticar(hash: string): Promise<ApiTokenRegistro | null> {
    const linha = await this.db.apiToken.findUnique({ where: { hash } });
    return linha ? paraRegistro(linha) : null;
  }
}
