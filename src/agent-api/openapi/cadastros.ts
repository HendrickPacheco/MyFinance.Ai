/**
 * Documentação OpenAPI do grupo "cadastros" — categorias, contas, custos
 * fixos, provisões, config e patrimônio. Reaproveita os MESMOS schemas zod
 * que as rotas usam para validar (`src/agent-api/schemas/cadastros.ts`).
 */
import type { EndpointDoc } from './tipos';
import {
  categoriaCriarSchema,
  categoriaAtualizarSchema,
  contaCriarSchema,
  contaAtualizarSchema,
  contasQuerySchema,
  custoFixoCriarSchema,
  custoFixoAtualizarSchema,
  provisaoCriarSchema,
  provisaoAtualizarSchema,
  configAtualizarSchema,
  patrimonioSnapshotCriarSchema,
} from '../schemas/cadastros';

export const ENDPOINTS_CADASTROS: EndpointDoc[] = [
  {
    metodo: 'GET',
    caminho: '/categorias',
    escopo: 'read',
    tag: 'Categorias',
    resumo: 'Lista as categorias do dono.',
  },
  {
    metodo: 'POST',
    caminho: '/categorias',
    escopo: 'write',
    tag: 'Categorias',
    resumo: 'Cria uma categoria.',
    body: categoriaCriarSchema,
    escrita: true,
  },
  {
    metodo: 'PATCH',
    caminho: '/categorias/{id}',
    escopo: 'write',
    tag: 'Categorias',
    resumo: 'Atualiza uma categoria.',
    descricao:
      'Não há exclusão: Categoria não tem flag de arquivamento/ativo no modelo. Edição parcial — campos omitidos preservam o valor atual.',
    body: categoriaAtualizarSchema,
    escrita: true,
  },

  {
    metodo: 'GET',
    caminho: '/contas',
    escopo: 'read',
    tag: 'Contas',
    resumo: 'Lista as contas do dono, com saldo.',
    query: contasQuerySchema,
  },
  {
    metodo: 'POST',
    caminho: '/contas',
    escopo: 'write',
    tag: 'Contas',
    resumo: 'Cria uma conta.',
    body: contaCriarSchema,
    escrita: true,
  },
  {
    metodo: 'PATCH',
    caminho: '/contas/{id}',
    escopo: 'write',
    tag: 'Contas',
    resumo: 'Atualiza uma conta; `arquivada: true` é o caminho de "excluir".',
    descricao: 'Edição parcial — campos omitidos preservam o valor atual. Não há DELETE.',
    body: contaAtualizarSchema,
    escrita: true,
  },

  {
    metodo: 'GET',
    caminho: '/custos-fixos',
    escopo: 'read',
    tag: 'Custos fixos',
    resumo: 'Lista custos fixos com status de pagamento no ciclo atual.',
    descricao:
      'Cada item inclui `ciclosComPagamento` (nº de ciclos já marcados como pagos) e `categoriaNome`, resolvidos pelo mesmo read-model da tela /custos.',
  },
  {
    metodo: 'POST',
    caminho: '/custos-fixos',
    escopo: 'write',
    tag: 'Custos fixos',
    resumo: 'Cria um custo fixo.',
    descricao: 'Resposta inclui `efeitoNoCicloAtual`: se o ciclo em curso ainda está vazio, ele já recalcula a verba de hoje.',
    body: custoFixoCriarSchema,
    escrita: true,
  },
  {
    metodo: 'PATCH',
    caminho: '/custos-fixos/{id}',
    escopo: 'write',
    tag: 'Custos fixos',
    resumo: 'Atualiza um custo fixo; `ativo: false/true` equivale a desativar/reativar.',
    descricao: 'Edição parcial — campos omitidos preservam o valor atual.',
    body: custoFixoAtualizarSchema,
    escrita: true,
  },
  {
    metodo: 'DELETE',
    caminho: '/custos-fixos/{id}',
    escopo: 'write',
    tag: 'Custos fixos',
    resumo: 'Exclui definitivamente um custo fixo.',
    descricao:
      'Recusado (422) quando já há `PagamentoFixo` registrado em algum ciclo — desative em vez de excluir.',
    escrita: true,
  },
  {
    metodo: 'POST',
    caminho: '/custos-fixos/{id}/pagar',
    escopo: 'write',
    tag: 'Custos fixos',
    resumo: 'Marca o custo fixo como pago NO CICLO ATUAL.',
    descricao:
      'Rastreamento puro — nunca abate a verba (já congelada quando o ciclo nasceu). Sempre o ciclo em curso; não há parâmetro `cicloId`/data/valor.',
    escrita: true,
  },
  {
    metodo: 'DELETE',
    caminho: '/custos-fixos/{id}/pagar',
    escopo: 'write',
    tag: 'Custos fixos',
    resumo: 'Desmarca o custo fixo como pago no ciclo atual.',
    descricao: 'Query `cicloId` é aceita mas ignorada: sempre atua sobre o ciclo em curso.',
    escrita: true,
  },

  {
    metodo: 'GET',
    caminho: '/provisoes',
    escopo: 'read',
    tag: 'Provisões',
    resumo: 'Lista provisões anuais, ativas e inativas.',
  },
  {
    metodo: 'POST',
    caminho: '/provisoes',
    escopo: 'write',
    tag: 'Provisões',
    resumo: 'Cria uma provisão anual.',
    body: provisaoCriarSchema,
    escrita: true,
  },
  {
    metodo: 'PATCH',
    caminho: '/provisoes/{id}',
    escopo: 'write',
    tag: 'Provisões',
    resumo: 'Atualiza uma provisão; `ativo: false/true` equivale a desativar/reativar.',
    descricao: 'Edição parcial — campos omitidos preservam o valor atual.',
    body: provisaoAtualizarSchema,
    escrita: true,
  },
  {
    metodo: 'DELETE',
    caminho: '/provisoes/{id}',
    escopo: 'write',
    tag: 'Provisões',
    resumo: 'Exclui definitivamente uma provisão.',
    descricao:
      'Recusado (422) com `acumuladoCents != 0` (zere/transfira antes) ou com gasto já lançado contra ela.',
    escrita: true,
  },

  {
    metodo: 'GET',
    caminho: '/config',
    escopo: 'read',
    tag: 'Config',
    resumo: 'Lê a Configuração e os agregados derivados (fixos, provisão mensal, sugestões).',
  },
  {
    metodo: 'PATCH',
    caminho: '/config',
    escopo: 'admin',
    tag: 'Config',
    resumo: 'Atualiza a Configuração (singleton).',
    descricao:
      'Edição parcial, fundida com a Config atual. Regra 3 do CLAUDE.md: a verba do ciclo em curso é CONGELADA — a mudança vale a partir do próximo ciclo, exceto quando `efeitoNoCicloAtual.recalculou` vier `true` (ciclo em curso ainda sem lançamento).',
    body: configAtualizarSchema,
    escrita: true,
  },

  {
    metodo: 'GET',
    caminho: '/patrimonio',
    escopo: 'read',
    tag: 'Patrimônio',
    resumo: 'Snapshots, curva, cobertura de reserva e divergências de conciliação.',
  },
  {
    metodo: 'POST',
    caminho: '/patrimonio/snapshots',
    escopo: 'write',
    tag: 'Patrimônio',
    resumo: 'Cria (ou substitui, se já houver um na mesma data) um snapshot de patrimônio.',
    body: patrimonioSnapshotCriarSchema,
    escrita: true,
  },
  {
    metodo: 'POST',
    caminho: '/patrimonio/itens/{id}/aceitar-realidade',
    escopo: 'write',
    tag: 'Patrimônio',
    resumo: 'Aceita a realidade observada: move o saldo da conta vinculada até o valor do snapshot.',
    descricao:
      'Ajusta `Conta.saldoCents` direto, SEM criar `Transacao` (D-13) — não consome teto diário nem aparece na análise por categoria.',
    escrita: true,
  },
];
