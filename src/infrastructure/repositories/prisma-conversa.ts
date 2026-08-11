/**
 * Adapter de `ConversaPort` (Fase 1 da persistência de conversas).
 *
 * Ao contrário de `prisma-memoria.ts`, aqui não há SQL cru: `proveniencia` é
 * `Json?`, tipo que o Prisma Client já sabe ler e escrever. O que este arquivo
 * protege é o mesmo de sempre — a regra de ouro do multi-tenant — porque
 * `obterComMensagens` com um id de OUTRO dono é o vetor de vazamento nº 1
 * desta feature: devolver a transcrição alheia por engano.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  Conversa,
  MensagemConversa,
  PapelMensagemConversa,
  Proveniencia,
} from '@/domain/model/entidades';
import type { ConversaComMensagens, ConversaPort, NovoTurno } from '@/domain/ports/conversa';
import { toConversa, toMensagemConversa } from './mappers';

/**
 * `proveniencia` é `Json?`: o Prisma exige `Prisma.JsonNull` (não o `null` do
 * JS) para gravar NULL num campo Json, senão o tipo do client rejeita — a
 * ambiguidade que ele evita é entre "sem valor" e "o valor JSON `null`", que
 * fariam sentido diferente num campo Json NOT NULL. Aqui o campo é nullable e
 * só usamos essa metade, mas o client não relaxa a exigência por isso.
 */
function paraJson(proveniencia: Proveniencia | null): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return proveniencia === null ? Prisma.JsonNull : (proveniencia as unknown as Prisma.InputJsonValue);
}

/** Título provisório até o primeiro turno decidir um melhor (fora do escopo desta fase). */
const TITULO_PADRAO = 'Nova conversa';

export class PrismaConversaRepository implements ConversaPort {
  constructor(
    private readonly db: PrismaClient,
    private readonly donoId: string,
  ) {}

  async criar(titulo: string): Promise<Conversa> {
    const criada = await this.db.conversa.create({
      data: { donoId: this.donoId, titulo: titulo.trim() || TITULO_PADRAO },
    });
    return toConversa(criada);
  }

  async listar(): Promise<Conversa[]> {
    const linhas = await this.db.conversa.findMany({
      where: { donoId: this.donoId },
      orderBy: { atualizadaEm: 'desc' },
    });
    return linhas.map(toConversa);
  }

  /**
   * `findFirst` com `{ id, donoId }`, nunca `findUnique({ id })` — é o ponto
   * exato onde a transcrição de outro dono vazaria (CLAUDE.md, regra de ouro).
   * Id inexistente e id de outro dono são indistinguíveis de propósito: os
   * dois devolvem `null`.
   */
  async obterComMensagens(id: string): Promise<ConversaComMensagens | null> {
    const linha = await this.db.conversa.findFirst({
      where: { id, donoId: this.donoId },
      // `id` como desempate: ver a nota sobre colisão de milissegundo em
      // `anexarTurno`. Sem ele, pergunta e resposta gravadas no mesmo
      // milissegundo sairiam em ordem arbitrária.
      include: { mensagens: { orderBy: [{ criadaEm: 'asc' }, { id: 'asc' }] } },
    });
    if (!linha) return null;

    const { mensagens, ...conversa } = linha;
    return {
      conversa: toConversa(conversa),
      mensagens: mensagens.map(toMensagemConversa),
    };
  }

  /**
   * Grava as duas mensagens do turno e bumpa `atualizadaEm` da conversa numa
   * única transação: pergunta sem resposta (ou vice-versa) é bug, não estado
   * válido, e o `updateMany` escopado por dono garante que um `conversaId` de
   * outro usuário não grava nada — a transação inteira aborta e nenhuma das
   * duas mensagens fica órfã no banco.
   */
  async anexarTurno(conversaId: string, turno: NovoTurno): Promise<void> {
    const agora = new Date();

    await this.db.$transaction(async (tx) => {
      // Bumpar ANTES de criar as mensagens: se o `conversaId` for de outro dono
      // (ou não existir), `count` vem 0 e o `throw` reverte a transação inteira
      // antes de qualquer mensagem ser gravada — nenhum turno pendurado numa
      // conversa que não pertence a este dono.
      const { count } = await tx.conversa.updateMany({
        where: { id: conversaId, donoId: this.donoId },
        data: { atualizadaEm: agora },
      });
      if (count === 0) {
        throw new Error(`Conversa ${conversaId} não encontrada.`);
      }

      // `criadaEm` EXPLÍCITO, com a resposta 1ms à frente da pergunta.
      //
      // Deixar no default significa depender de dois `create` consecutivos
      // caírem em milissegundos diferentes — `TIMESTAMP(3)` não tem precisão
      // abaixo disso. Empiricamente eles ficam 1ms apart num socket local, mas
      // não é garantia: numa colisão, `orderBy criadaEm` fica sem desempate e o
      // Postgres pode devolver a RESPOSTA ANTES DA PERGUNTA. Como esse array
      // vira o `historico` mandado ao modelo, o efeito seria uma conversa
      // invertida chegando ao copiloto — silenciosamente, sem erro nenhum.
      await tx.mensagemConversa.create({
        data: {
          donoId: this.donoId,
          conversaId,
          papel: 'usuario' satisfies PapelMensagemConversa,
          conteudo: turno.pergunta,
          proveniencia: paraJson(null),
          criadaEm: agora,
        },
      });
      await tx.mensagemConversa.create({
        data: {
          donoId: this.donoId,
          conversaId,
          papel: 'assistente' satisfies PapelMensagemConversa,
          conteudo: turno.resposta,
          proveniencia: paraJson(turno.proveniencia),
          criadaEm: new Date(agora.getTime() + 1),
        },
      });
    });
  }

  async ultimasMensagens(conversaId: string, limite: number): Promise<MensagemConversa[]> {
    // Busca as mais recentes com `take` negativo simularia a janela, mas o
    // Prisma não garante ordem estável nesse caso — mais seguro pedir `desc` e
    // reverter em memória, que é O(limite) e nunca varre a tabela inteira.
    const linhas = await this.db.mensagemConversa.findMany({
      where: { conversaId, donoId: this.donoId },
      orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
      take: limite,
    });
    return linhas.reverse().map(toMensagemConversa);
  }

  async renomear(id: string, titulo: string): Promise<void> {
    await this.db.conversa.updateMany({
      where: { id, donoId: this.donoId },
      data: { titulo: titulo.trim() || TITULO_PADRAO },
    });
  }

  async excluir(id: string): Promise<void> {
    // `onDelete: Cascade` em `MensagemConversa.conversaId` leva as mensagens
    // junto — não há necessidade de apagá-las manualmente antes.
    await this.db.conversa.deleteMany({ where: { id, donoId: this.donoId } });
  }
}
