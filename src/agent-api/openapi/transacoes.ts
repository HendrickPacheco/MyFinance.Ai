/**
 * Doc OpenAPI do grupo "Transações" (transações, lote, estorno, parcelamentos
 * e pagamento de parcela). Reusa os MESMOS schemas zod que as rotas validam
 * (`src/agent-api/schemas/transacoes.ts`) — a doc nunca pode divergir da
 * validação de verdade.
 */
import type { EndpointDoc } from './tipos';
import {
  listarTransacoesQuerySchema,
  transacaoBodySchema,
  excluirTransacaoBodySchema,
  estornarBodySchema,
  loteTransacoesSchema,
  criarParcelamentoBodySchema,
  editarParcelamentoBodySchema,
  encerrarParcelamentoBodySchema,
} from '../schemas/transacoes';

const TAG = 'Transações';

export const ENDPOINTS_TRANSACOES: EndpointDoc[] = [
  {
    metodo: 'GET',
    caminho: '/transacoes',
    escopo: 'read',
    tag: TAG,
    resumo: 'Lista transações com filtros, ordenação e paginação por cursor.',
    query: listarTransacoesQuerySchema,
  },
  {
    metodo: 'GET',
    caminho: '/transacoes/{id}',
    escopo: 'read',
    tag: TAG,
    resumo: 'Obtém uma transação por id.',
  },
  {
    metodo: 'POST',
    caminho: '/transacoes',
    escopo: 'write',
    tag: TAG,
    resumo: 'Cria uma transação (despesa, renda, transferência ou estorno manual).',
    descricao:
      'Mesma regra de negócio de `criarTransacao` (SPEC 8): competência na data da compra, ' +
      'TRANSFERENCIA nunca é gasto. Suporta `?dryRun=true` e `Idempotency-Key`.',
    body: transacaoBodySchema,
    escrita: true,
  },
  {
    metodo: 'PATCH',
    caminho: '/transacoes/{id}',
    escopo: 'write',
    tag: TAG,
    resumo: 'Edita uma transação.',
    descricao:
      'Editar uma transação de ciclo já fechado (ou mover a data para dentro/fora de um) exige ' +
      '`confirmarRetroativo: true` no corpo — sem isso devolve 409 CONFIRMACAO_NECESSARIA (SPEC regra 9).',
    body: transacaoBodySchema,
    escrita: true,
  },
  {
    metodo: 'DELETE',
    caminho: '/transacoes/{id}',
    escopo: 'write',
    tag: TAG,
    resumo: 'Exclui uma transação.',
    descricao: 'Mesma guarda de retroatividade de PATCH — aceita `confirmarRetroativo` no corpo.',
    body: excluirTransacaoBodySchema,
    escrita: true,
  },
  {
    metodo: 'POST',
    caminho: '/transacoes/{id}/estornar',
    escopo: 'write',
    tag: TAG,
    resumo: 'Estorna uma transação (SPEC regra 5).',
    descricao: 'Abate na data da transação original quando ela existe; senão na data do estorno.',
    body: estornarBodySchema,
    escrita: true,
  },
  {
    metodo: 'POST',
    caminho: '/transacoes/lote',
    escopo: 'write',
    tag: TAG,
    resumo: 'Cria várias transações de uma vez — tudo ou nada.',
    descricao:
      'Até 100 itens. Uma falha em qualquer item reverte o lote inteiro; o erro traz `details.indice` ' +
      'do item que falhou (exceto confirmação de retroatividade, que é do lote inteiro — 409).',
    body: loteTransacoesSchema,
    escrita: true,
  },
  {
    metodo: 'GET',
    caminho: '/parcelamentos',
    escopo: 'read',
    tag: TAG,
    resumo: 'Lista todos os parcelamentos (em andamento e encerrados) com números agregados.',
  },
  {
    metodo: 'GET',
    caminho: '/parcelamentos/{id}',
    escopo: 'read',
    tag: TAG,
    resumo: 'Obtém um parcelamento por id, com números agregados.',
  },
  {
    metodo: 'POST',
    caminho: '/parcelamentos',
    escopo: 'write',
    tag: TAG,
    resumo: 'Cria uma compra parcelada — gera as N parcelas.',
    body: criarParcelamentoBodySchema,
    escrita: true,
  },
  {
    metodo: 'PATCH',
    caminho: '/parcelamentos/{id}',
    escopo: 'write',
    tag: TAG,
    resumo: 'Edita o cadastro de um parcelamento.',
    descricao:
      '`valorTotalCents`/`numParcelas`/`dataCompra` só são aceitos sem parcela paga nem em ciclo ' +
      'fechado (senão 422 `ParcelamentoImutavelError`). `descricao`/`categoriaId`/`metodo` sempre editáveis.',
    body: editarParcelamentoBodySchema,
    escrita: true,
  },
  {
    metodo: 'DELETE',
    caminho: '/parcelamentos/{id}',
    escopo: 'write',
    tag: TAG,
    resumo: 'Encerra um parcelamento (cancela as parcelas futuras ainda não pagas).',
    descricao:
      'Não é exclusão do histórico: parcelas pagas e as de ciclo fechado são preservadas (R1). ' +
      'Ver `GET /parcelamentos/{id}/previa-encerramento` para os números antes de agir.',
    body: encerrarParcelamentoBodySchema,
    escrita: true,
  },
  {
    metodo: 'GET',
    caminho: '/parcelamentos/{id}/previa-encerramento',
    escopo: 'read',
    tag: TAG,
    resumo: 'Números do encerramento ANTES de executá-lo (pagas, a cancelar, preservadas).',
  },
  {
    metodo: 'POST',
    caminho: '/parcelamentos/{id}/parcelas/{transacaoId}/pagar',
    escopo: 'write',
    tag: TAG,
    resumo: 'Marca uma parcela como paga (rastreamento puro — não afeta verba nem saldo).',
    escrita: true,
  },
  {
    metodo: 'DELETE',
    caminho: '/parcelamentos/{id}/parcelas/{transacaoId}/pagar',
    escopo: 'write',
    tag: TAG,
    resumo: 'Desmarca uma parcela paga.',
    escrita: true,
  },
];
