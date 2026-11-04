/**
 * Documentação OpenAPI do grupo "ciclos" — todos os endpoints de leitura de
 * ciclo/análise/projeção/simulação e o fechamento. Referencia os MESMOS
 * objetos zod de `@/agent-api/schemas/ciclos` que as rotas usam para validar.
 */
import type { EndpointDoc } from './tipos';
import {
  bodySimularCompraParceladaSchema,
  bodySimularMetaPrazoSchema,
  bodySimularRendaSchema,
  fechamentoSchema,
  queryCompararCiclosSchema,
  queryGastosPorCategoriaSchema,
  queryLimiteOpcionalSchema,
  queryListaCiclosSchema,
  queryNumCiclosOpcionalSchema,
  queryProjecaoSchema,
  queryTendenciasSchema,
} from '../schemas/ciclos';

const TAG = 'Ciclos';

export const ENDPOINTS_CICLOS: EndpointDoc[] = [
  {
    metodo: 'GET',
    caminho: '/contexto',
    escopo: 'read',
    tag: TAG,
    resumo: 'Contexto completo: config, ciclo atual, contas, categorias, custos fixos, parcelamentos, provisões e último snapshot de patrimônio.',
    descricao:
      'O primeiro endpoint que o agente deve chamar. `ciclo` vem `null` com `cicloMotivo` preenchido quando não há ciclo aberto (D-14).',
  },
  {
    metodo: 'GET',
    caminho: '/ciclos',
    escopo: 'read',
    tag: TAG,
    resumo: 'Lista o ciclo em curso (se houver) seguido dos últimos `limite` ciclos fechados, com os totais congelados.',
    query: queryListaCiclosSchema,
  },
  {
    metodo: 'GET',
    caminho: '/ciclos/{id}',
    escopo: 'read',
    tag: TAG,
    resumo: 'Detalhe de um ciclo (inclusive fechado): totais congelados + gasto por categoria.',
  },
  {
    metodo: 'GET',
    caminho: '/ciclos/comparar',
    escopo: 'read',
    tag: TAG,
    resumo: 'Compara ciclos por `ids` (lista separada por vírgula, na ordem dada) ou os últimos `ultimos` fechados.',
    query: queryCompararCiclosSchema,
  },
  {
    metodo: 'GET',
    caminho: '/ciclos/atual/previa-fechamento',
    escopo: 'read',
    tag: TAG,
    resumo: 'Prévia do fechamento do ciclo pendente/atual: sobra, transações sem categoria, sugestão de meta e para onde a sobra iria.',
  },
  {
    metodo: 'POST',
    caminho: '/ciclos/atual/fechar',
    escopo: 'admin',
    tag: TAG,
    resumo: 'Fecha o ciclo pendente (o anterior ainda aberto) ou o atual. Exige medir a poupança real: snapshot de patrimônio no fim do ciclo (±5 dias, salvo ou em `snapshotItens`) ou `poupancaRealManualCents` — sem isso responde 422. Suporta `?dryRun=true` e `Idempotency-Key`.',
    body: fechamentoSchema,
    escrita: true,
  },
  {
    metodo: 'POST',
    caminho: '/ciclos/atual/recalcular',
    escopo: 'admin',
    tag: TAG,
    resumo: 'Recongela os parâmetros do ciclo atual a partir da Config vigente (SPEC 5.2). Sem corpo.',
    escrita: true,
  },
  {
    metodo: 'GET',
    caminho: '/gastos-por-categoria',
    escopo: 'read',
    tag: TAG,
    resumo: 'Gasto de verba variável por categoria, num ciclo (`cicloId`) ou num intervalo livre de datas (`de`+`ate`).',
    query: queryGastosPorCategoriaSchema,
  },
  {
    metodo: 'GET',
    caminho: '/tendencias',
    escopo: 'read',
    tag: TAG,
    resumo: 'Série do gasto de uma categoria (`categoriaId`) pelos últimos `ultimos` ciclos fechados (default 6).',
    query: queryTendenciasSchema,
  },
  {
    metodo: 'GET',
    caminho: '/assinaturas',
    escopo: 'read',
    tag: TAG,
    resumo: 'Assinaturas recorrentes detectadas nos últimos `numCiclos` ciclos fechados (default 3).',
    query: queryNumCiclosOpcionalSchema,
  },
  {
    metodo: 'GET',
    caminho: '/analise-corte',
    escopo: 'read',
    tag: TAG,
    resumo: 'Ranking de categorias por custo anualizado, tendência e essencialidade, nos últimos `numCiclos` ciclos fechados.',
    query: queryNumCiclosOpcionalSchema,
  },
  {
    metodo: 'GET',
    caminho: '/para-onde-vai-a-renda',
    escopo: 'read',
    tag: TAG,
    resumo: 'Decomposição "para onde vai a renda" do ciclo em curso: blocos de topo, disponível para gastar e gasto por categoria com origem.',
    query: queryLimiteOpcionalSchema,
  },
  {
    metodo: 'GET',
    caminho: '/projecao',
    escopo: 'read',
    tag: TAG,
    resumo: 'Projeta `ciclos` ciclos a partir de hoje (default 6, teto 60), com premissas em linguagem natural.',
    query: queryProjecaoSchema,
  },
  {
    metodo: 'POST',
    caminho: '/simular/compra-parcelada',
    escopo: 'read',
    tag: TAG,
    resumo: 'Pré-mortem de uma compra parcelada: projeta com e sem a compra e devolve o delta por ciclo. Só leitura — nada é gravado.',
    body: bodySimularCompraParceladaSchema,
  },
  {
    metodo: 'POST',
    caminho: '/simular/meta-prazo',
    escopo: 'read',
    tag: TAG,
    resumo: 'Quanto separar por ciclo para juntar um alvo até uma data-limite. Só leitura — nada é gravado.',
    body: bodySimularMetaPrazoSchema,
  },
  {
    metodo: 'POST',
    caminho: '/simular/renda',
    escopo: 'read',
    tag: TAG,
    resumo: 'Simula o impacto de uma renda hipotética nos próximos ciclos; o ciclo em curso nunca é alterado (SPEC 5.2). Só leitura.',
    body: bodySimularRendaSchema,
  },
];
