/**
 * Adapter de `MemoriaPort` (Fase E, tarefa E3).
 *
 * É o ÚNICO arquivo do repositório que conhece pgvector. O Prisma não tipa
 * `vector`, então toda leitura e escrita do campo `embedding` é SQL cru — e
 * fica confinada aqui, atrás da porta, exatamente como o SDK do provedor fica
 * confinado em `infrastructure/ia/`.
 *
 * ─── REGRA DE OURO DO MULTI-TENANT (CLAUDE.md) ───
 *
 * SQL cru não herda o escopo automático que o Prisma Client dá. Aqui isso é
 * uma armadilha nova, não a antiga: `findUnique` não é o risco — o risco é
 * esquecer `AND "donoId" = $n` numa query montada à mão. TODA consulta abaixo
 * filtra por `donoId`, inclusive as de escrita por id, que usam UPDATE ... WHERE
 * id AND donoId (id alheio afeta zero linhas, em vez de alterá-las).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  Memoria,
  MemoriaComRelevancia,
  MemoriaPort,
  NovaMemoria,
} from '@/domain/ports/memoria';
import { ehTipoMemoria, type TipoMemoria } from '@/domain/memoria/regras';

/** Quantas memórias a busca semântica devolve quando o chamador não diz. */
const LIMITE_BUSCA_PADRAO = 5;
/** Teto de segurança para `listar`, para uma tela nunca puxar a tabela inteira. */
const LIMITE_LISTA_PADRAO = 200;

/** Linha crua como o Postgres devolve — o vetor não volta, ninguém precisa dele. */
interface LinhaMemoria {
  id: string;
  tipo: string;
  texto: string;
  origem: string;
  ativo: boolean;
  createdAt: Date;
}

interface LinhaMemoriaComDistancia extends LinhaMemoria {
  distancia: number;
}

/**
 * O tipo do banco é `String` (o schema não tem enum), então a fronteira precisa
 * decidir o que fazer com lixo. Cair no tipo mais neutro é melhor que lançar:
 * uma memória com tipo corrompido continua visível e arquivável na tela de
 * auditoria, em vez de derrubar a tela inteira.
 */
function paraTipo(bruto: string): TipoMemoria {
  return ehTipoMemoria(bruto) ? bruto : 'CONTEXTO';
}

function toMemoria(linha: LinhaMemoria): Memoria {
  return {
    id: linha.id,
    tipo: paraTipo(linha.tipo),
    texto: linha.texto,
    origem: linha.origem === 'COPILOTO' ? 'COPILOTO' : 'USUARIO',
    ativo: linha.ativo,
    criadoEm: linha.createdAt,
  };
}

/**
 * Serializa o vetor no literal que o pgvector aceita: `[0.1,0.2,...]`.
 *
 * Vai para a query como PARÂMETRO, com cast explícito `::vector` — nunca
 * interpolado no texto do SQL. Um array de números não parece perigoso, mas a
 * regra "todo valor é parâmetro" não admite exceção por parecer inofensiva.
 */
function paraLiteralVetor(vetor: readonly number[]): string {
  return `[${vetor.join(',')}]`;
}

export class PrismaMemoriaRepository implements MemoriaPort {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async criar(nova: NovaMemoria): Promise<Memoria> {
    // Duas etapas de propósito: o `create` do Prisma não sabe escrever
    // `vector`, e um INSERT cru precisaria replicar defaults (cuid, timestamps)
    // à mão. Criar pelo Prisma e só então preencher o vetor mantém uma única
    // fonte para os defaults.
    const criada = await this.db.memoria.create({
      data: {
        donoId: this.donoId,
        tipo: nova.tipo,
        texto: nova.texto,
        origem: nova.origem,
      },
      select: { id: true, tipo: true, texto: true, origem: true, ativo: true, createdAt: true },
    });

    if (nova.embedding && nova.embedding.length > 0) {
      await this.db.$executeRaw`
        UPDATE "Memoria"
           SET "embedding" = ${paraLiteralVetor(nova.embedding)}::vector
         WHERE "id" = ${criada.id} AND "donoId" = ${this.donoId}
      `;
    }

    return toMemoria(criada);
  }

  async listar(opcoes?: {
    tipos?: readonly TipoMemoria[];
    incluirArquivadas?: boolean;
    limite?: number;
  }): Promise<Memoria[]> {
    const linhas = await this.db.memoria.findMany({
      where: {
        donoId: this.donoId,
        ...(opcoes?.incluirArquivadas ? {} : { ativo: true }),
        ...(opcoes?.tipos?.length ? { tipo: { in: [...opcoes.tipos] } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opcoes?.limite ?? LIMITE_LISTA_PADRAO,
      select: { id: true, tipo: true, texto: true, origem: true, ativo: true, createdAt: true },
    });
    return linhas.map(toMemoria);
  }

  async obter(id: string): Promise<Memoria | null> {
    // `findFirst` com `{ id, donoId }`, nunca `findUnique` — este é o ponto
    // exato onde o dado de outro usuário entraria (CLAUDE.md, regra de ouro).
    const linha = await this.db.memoria.findFirst({
      where: { id, donoId: this.donoId },
      select: { id: true, tipo: true, texto: true, origem: true, ativo: true, createdAt: true },
    });
    return linha ? toMemoria(linha) : null;
  }

  async buscarPorEmbedding(
    embedding: readonly number[],
    opcoes?: { limite?: number; tipos?: readonly TipoMemoria[] },
  ): Promise<MemoriaComRelevancia[]> {
    if (embedding.length === 0) return [];

    const vetor = paraLiteralVetor(embedding);
    const limite = opcoes?.limite ?? LIMITE_BUSCA_PADRAO;
    const tipos = opcoes?.tipos ?? [];

    // Fragmento montado com `Prisma.sql`/`Prisma.join`: os tipos continuam
    // sendo PARÂMETROS, não texto concatenado na query.
    const filtroTipo = tipos.length
      ? Prisma.sql`AND "tipo" IN (${Prisma.join(tipos.map((t) => Prisma.sql`${t}`))})`
      : Prisma.empty;

    // `embedding IS NOT NULL` é o que faz memória não indexada degradar em vez
    // de quebrar: ela some da busca semântica, mas continua na listagem.
    const linhas = await this.db.$queryRaw<LinhaMemoriaComDistancia[]>(Prisma.sql`
      SELECT "id", "tipo", "texto", "origem", "ativo", "createdAt",
             ("embedding" <=> ${vetor}::vector) AS "distancia"
        FROM "Memoria"
       WHERE "donoId" = ${this.donoId}
         AND "ativo" = true
         AND "embedding" IS NOT NULL
         ${filtroTipo}
       ORDER BY "embedding" <=> ${vetor}::vector
       LIMIT ${limite}
    `);

    return linhas.map((linha) => ({ ...toMemoria(linha), distancia: Number(linha.distancia) }));
  }

  /**
   * `embedding IS NULL` não é expressável pelo Prisma Client num campo
   * `Unsupported`, então esta consulta também é SQL cru — e também filtra por
   * `donoId`, como todas as outras.
   */
  async listarSemEmbedding(limite = 100): Promise<Memoria[]> {
    const linhas = await this.db.$queryRaw<LinhaMemoria[]>`
      SELECT "id", "tipo", "texto", "origem", "ativo", "createdAt"
        FROM "Memoria"
       WHERE "donoId" = ${this.donoId}
         AND "ativo" = true
         AND "embedding" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT ${limite}
    `;
    return linhas.map(toMemoria);
  }

  async definirEmbedding(id: string, embedding: readonly number[]): Promise<void> {
    if (embedding.length === 0) return;
    await this.db.$executeRaw`
      UPDATE "Memoria"
         SET "embedding" = ${paraLiteralVetor(embedding)}::vector
       WHERE "id" = ${id} AND "donoId" = ${this.donoId}
    `;
  }

  async arquivar(id: string): Promise<void> {
    await this.definirAtivo(id, false);
  }

  async reativar(id: string): Promise<void> {
    await this.definirAtivo(id, true);
  }

  /**
   * `updateMany` com `{ id, donoId }`: com id de outro dono a operação afeta
   * zero linhas em vez de alterá-las (CLAUDE.md). `update` por id não aceita
   * filtro extra e por isso não pode ser usado aqui.
   */
  private async definirAtivo(id: string, ativo: boolean): Promise<void> {
    await this.db.memoria.updateMany({
      where: { id, donoId: this.donoId },
      data: { ativo },
    });
  }

  async excluirTodas(): Promise<void> {
    await this.db.memoria.deleteMany({ where: { donoId: this.donoId } });
  }
}
