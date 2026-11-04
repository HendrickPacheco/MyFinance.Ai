import { rotaEscrita, ErroApi } from '@/agent-api';
import { loteTransacoesSchema } from '@/agent-api/schemas/transacoes';
import { criarTransacoesEmLote, LoteTransacaoFalhouError } from '@/application/transacoes';

export const dynamic = 'force-dynamic';

/**
 * Tudo ou nada: o kernel (`rotaEscrita`) já roda este handler inteiro dentro
 * de UMA transação Prisma interativa — um erro lançado aqui no meio do laço
 * (dentro de `criarTransacoesEmLote`) reverte tudo que já foi escrito.
 */
export const POST = rotaEscrita(
  {
    escopo: 'write',
    body: loteTransacoesSchema,
    entidade: 'Transacao',
    acao: 'CREATE',
    status: 201,
  },
  async ({ deps, body, auditar }) => {
    const itens = body.transacoes.map((item) => ({
      ...item,
      confirmarRetroativo: item.confirmarRetroativo ?? body.confirmarRetroativo,
    }));

    let transacoes;
    try {
      transacoes = await criarTransacoesEmLote(deps, itens);
    } catch (erro) {
      if (erro instanceof LoteTransacaoFalhouError) {
        const naoEncontrada = erro.causa.name.includes('NaoEncontrado');
        throw new ErroApi(
          naoEncontrada ? 404 : 422,
          naoEncontrada ? 'NAO_ENCONTRADO' : 'REGRA_DE_NEGOCIO',
          erro.causa.message,
          { indice: erro.indice },
        );
      }
      throw erro;
    }

    for (const transacao of transacoes) auditar({ entidadeId: transacao.id, depois: transacao });
    return { transacoes };
  },
);
