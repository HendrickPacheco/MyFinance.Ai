/**
 * Doc OpenAPI do grupo `importacao-admin` — importação de fatura e
 * auditoria do agente. Reusa os MESMOS objetos zod das rotas
 * (`src/agent-api/schemas/importacao-admin.ts`); nunca redeclara schema
 * aqui, para a doc não poder divergir da validação de verdade.
 */
import type { EndpointDoc } from './tipos';
import {
  aprovarImportacaoBodySchema,
  auditoriaQuerySchema,
  criarImportacaoBodySchema,
  desfazerImportacaoBodySchema,
} from '../schemas/importacao-admin';

export const ENDPOINTS_IMPORTACAO_ADMIN: EndpointDoc[] = [
  {
    metodo: 'POST',
    caminho: '/importacao',
    escopo: 'write',
    tag: 'Importação',
    resumo: 'Concilia uma fatura (texto colado ou PDF em base64) e devolve o rascunho para revisão.',
    descricao:
      'Extrai os itens (IA) e concilia contra transações, parcelas e custos fixos existentes. ' +
      'Nenhuma linha é gravada aqui — só o rascunho. Idempotente pelo hash do conteúdo.',
    body: criarImportacaoBodySchema,
    escrita: true,
  },
  {
    metodo: 'GET',
    caminho: '/importacao/{id}',
    escopo: 'read',
    tag: 'Importação',
    resumo: 'Estado atual de um rascunho de importação (cabeçalho + itens).',
  },
  {
    metodo: 'POST',
    caminho: '/importacao/{id}/aprovar',
    escopo: 'write',
    tag: 'Importação',
    resumo: 'Aprova/descarta linhas de um rascunho e, opcionalmente, finaliza a importação.',
    descricao:
      'Cada item aprovado grava o que o veredito já decidiu (transação, parcelamento ou ' +
      'rastreamento de custo fixo pago — nunca uma Transacao para custo fixo). Tudo roda numa ' +
      'única transação: ou todo o lote comita, ou nada comita.',
    body: aprovarImportacaoBodySchema,
    escrita: true,
  },
  {
    metodo: 'POST',
    caminho: '/importacao/{id}/desfazer',
    escopo: 'write',
    tag: 'Importação',
    resumo: 'Desfaz uma importação inteira, revertendo cada linha pelo caminho que a criou.',
    body: desfazerImportacaoBodySchema,
    escrita: true,
  },
  {
    metodo: 'GET',
    caminho: '/auditoria',
    escopo: 'read',
    tag: 'Auditoria',
    resumo: 'Lista o que o agente fez (toda escrita, real ou dryRun), paginado por cursor.',
    query: auditoriaQuerySchema,
  },
];
