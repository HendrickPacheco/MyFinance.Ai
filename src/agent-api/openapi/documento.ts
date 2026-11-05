/**
 * Monta o documento OpenAPI 3.0.3 da API do agente a partir dos 4 arrays de
 * `EndpointDoc` (`transacoes.ts`, `cadastros.ts`, `ciclos.ts`,
 * `importacao-admin.ts`). Esta função é PURA — nenhum I/O, nenhuma dependência
 * de Next/Prisma — para poder ser chamada tanto pela rota
 * (`app/api/agent/v1/openapi.json/route.ts`) quanto pelo teste de bijeção
 * (`documento.test.ts`) sem precisar de banco nem de servidor.
 *
 * Cada schema zod é convertido com `zodToJsonSchema` (`target: 'openApi3'`),
 * reaproveitando os MESMOS objetos que as rotas usam para validar — nunca uma
 * cópia redigitada à mão, que divergiria silenciosamente da validação real.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import type { EndpointDoc } from './tipos';
import { ENDPOINTS_TRANSACOES } from './transacoes';
import { ENDPOINTS_CADASTROS } from './cadastros';
import { ENDPOINTS_CICLOS } from './ciclos';
import { ENDPOINTS_IMPORTACAO_ADMIN } from './importacao-admin';

const TODOS_OS_ENDPOINTS: readonly EndpointDoc[] = [
  ...ENDPOINTS_TRANSACOES,
  ...ENDPOINTS_CADASTROS,
  ...ENDPOINTS_CICLOS,
  ...ENDPOINTS_IMPORTACAO_ADMIN,
];

/** Exportado para o teste de bijeção comparar contra o filesystem sem reimportar os 4 arrays. */
export { TODOS_OS_ENDPOINTS };

interface JsonSchemaObjeto {
  type?: string;
  properties?: Record<string, unknown>;
  required?: readonly string[];
  [chave: string]: unknown;
}

function paraJsonSchema(schema: ZodTypeAny): JsonSchemaObjeto {
  // Sem `name`: devolve o schema inline, nunca um `$ref` para um bloco
  // `definitions` que precisaríamos montar e referenciar à parte.
  return zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as JsonSchemaObjeto;
}

/** Segmentos `{id}`/`{transacaoId}` do caminho, na ordem em que aparecem. */
function parametrosDeCaminho(caminho: string): string[] {
  return [...caminho.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? '');
}

function parametroDeCaminho(nome: string) {
  return {
    name: nome,
    in: 'path',
    required: true,
    description: `Identificador de ${nome === 'id' ? 'recurso' : nome}.`,
    schema: { type: 'string' },
  };
}

/**
 * Um parâmetro de query por propriedade do schema (quando é um objeto JSON
 * Schema com `properties` — é o caso de toda query da API, inclusive as que
 * passam por `.refine()`/`.transform()`: `zodToJsonSchema` usa o schema de
 * ENTRADA do efeito por padrão, que ainda é o `z.object({...})` original).
 * Sem `properties` (caso não previsto hoje), cai para um parâmetro único
 * `query` com o JSON Schema inteiro, em vez de quebrar a geração do doc.
 */
function parametrosDeQuery(schema: ZodTypeAny): unknown[] {
  const jsonSchema = paraJsonSchema(schema);
  const propriedades = jsonSchema.properties;
  if (!propriedades) {
    return [{ name: 'query', in: 'query', required: false, schema: jsonSchema }];
  }
  const obrigatorios = new Set(jsonSchema.required ?? []);
  return Object.entries(propriedades).map(([nome, propSchema]) => ({
    name: nome,
    in: 'query',
    required: obrigatorios.has(nome),
    schema: propSchema,
  }));
}

const PARAMETRO_DRY_RUN = {
  name: 'dryRun',
  in: 'query',
  required: false,
  description:
    'Executa a escrita dentro de uma transação e reverte ao final — a resposta mostra exatamente ' +
    'o que teria sido gravado (inclusive `impactoCiclo`), mas nada persiste. A auditoria registra a ' +
    'tentativa com `dryRun: true`.',
  schema: { type: 'boolean', default: false },
};

const CABECALHO_IDEMPOTENCIA = {
  name: 'Idempotency-Key',
  in: 'header',
  required: false,
  description:
    'Chave de replay (TTL 24h). Reenviar a MESMA chave com o MESMO corpo devolve a resposta original ' +
    '(header `Idempotent-Replayed: true`), sem repetir a escrita. Reenviar a mesma chave com corpo ' +
    'DIFERENTE é erro de cliente: 422 `IDEMPOTENCY_KEY_REUSED`.',
  schema: { type: 'string' },
};

const ESQUEMA_ERRO = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', description: 'Código estável, para o agente decidir programaticamente (ex.: "NAO_ENCONTRADO").' },
        message: { type: 'string', description: 'Mensagem em português, pronta para mostrar ao dono.' },
        details: { description: 'Opcional — formato varia por `code` (ex.: `ciclosAfetados`, issues do zod, `indice` do item que falhou num lote).' },
      },
    },
  },
};

const RESPOSTA_ERRO_PADRAO = (descricao: string) => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
});

const RESPOSTAS_COMUNS = {
  400: RESPOSTA_ERRO_PADRAO('Entrada inválida (`VALIDATION_ERROR`) ou corpo que não é JSON (`JSON_INVALIDO`).'),
  401: RESPOSTA_ERRO_PADRAO('Token ausente, malformado, inválido, revogado ou expirado (`NAO_AUTENTICADO`).'),
  403: RESPOSTA_ERRO_PADRAO('Token sem o escopo exigido (`ESCOPO_INSUFICIENTE`) ou ação negada pela regra de negócio (`ACESSO_NEGADO`).'),
  404: RESPOSTA_ERRO_PADRAO('Recurso não encontrado (`NAO_ENCONTRADO`).'),
  409: RESPOSTA_ERRO_PADRAO('Conflito de dado único (`CONFLITO`) ou edição retroativa exige confirmação (`CONFIRMACAO_NECESSARIA` — reenviar com `confirmarRetroativo: true`).'),
  422: RESPOSTA_ERRO_PADRAO('Regra de negócio do domínio recusou a operação (`REGRA_DE_NEGOCIO`) ou reuso de `Idempotency-Key` com corpo diferente (`IDEMPOTENCY_KEY_REUSED`).'),
  429: RESPOSTA_ERRO_PADRAO('Limite de 120 requisições/minuto por token excedido (`LIMITE_DE_TAXA`); ver header `Retry-After`.'),
};

const NOTA_CENTS_E_FMT =
  'Todo valor monetário é um inteiro em centavos num campo terminado em `Cents` (nunca float). ' +
  'A resposta de toda rota da API do agente acrescenta, ao lado de cada `<algo>Cents`, o par ' +
  '`<algo>Fmt` já formatado em BRL (ex.: `valorCents: 15000` vem com `valorFmt: "R$ 150,00"`).';

const NOTA_IMPACTO_CICLO =
  'Toda escrita devolve `impactoCiclo` (verba livre e ritmo diário de hoje, antes/depois) usando os ' +
  'MESMOS read-models da tela Hoje — ou `impactoCiclo: null` com `impactoCicloMotivo` preenchido ' +
  'quando não há ciclo aberto para comparar.';

function operationId(metodo: string, caminho: string): string {
  const slug = caminho
    .replace(/[{}]/g, '')
    .split('/')
    .filter(Boolean)
    .join('-');
  return `${metodo.toLowerCase()}-${slug}`;
}

function descricaoCompleta(endpoint: EndpointDoc): string {
  const partes = [endpoint.descricao];
  if (endpoint.escrita) partes.push(NOTA_IMPACTO_CICLO);
  return partes.filter(Boolean).join('\n\n');
}

function respostasDoEndpoint(endpoint: EndpointDoc): Record<string, unknown> {
  const statusSucesso = endpoint.escrita ? '200' : '200';
  const respostaSucesso = {
    description: endpoint.escrita
      ? 'Escrita realizada (ou simulada, com `dryRun: true`, se `?dryRun=true`).'
      : 'Sucesso.',
    content: { 'application/json': { schema: { type: 'object' } } },
  };

  const comuns: Record<string, unknown> = { [statusSucesso]: respostaSucesso, 401: RESPOSTAS_COMUNS[401] };
  if (endpoint.query || endpoint.body) comuns['400'] = RESPOSTAS_COMUNS[400];
  if (endpoint.escopo !== 'read') comuns['403'] = RESPOSTAS_COMUNS[403];
  if (endpoint.caminho.includes('{')) comuns['404'] = RESPOSTAS_COMUNS[404];
  if (endpoint.escrita) {
    comuns['409'] = RESPOSTAS_COMUNS[409];
    comuns['422'] = RESPOSTAS_COMUNS[422];
  }
  comuns['429'] = RESPOSTAS_COMUNS[429];
  return comuns;
}

function montarOperacao(endpoint: EndpointDoc): Record<string, unknown> {
  const parametros = [
    ...parametrosDeCaminho(endpoint.caminho).map(parametroDeCaminho),
    ...(endpoint.query ? parametrosDeQuery(endpoint.query) : []),
  ];
  if (endpoint.escrita) {
    parametros.push(PARAMETRO_DRY_RUN, CABECALHO_IDEMPOTENCIA);
  }

  const operacao: Record<string, unknown> = {
    operationId: operationId(endpoint.metodo, endpoint.caminho),
    summary: endpoint.resumo,
    description: descricaoCompleta(endpoint) || undefined,
    tags: [endpoint.tag],
    security: [{ bearerAuth: [] }],
    'x-escopo': endpoint.escopo,
    parameters: parametros.length > 0 ? parametros : undefined,
    responses: respostasDoEndpoint(endpoint),
  };

  if (endpoint.body) {
    operacao.requestBody = {
      required: true,
      content: { 'application/json': { schema: paraJsonSchema(endpoint.body) } },
    };
  }

  return operacao;
}

/** `/transacoes/{id}` -> `{ "/transacoes/{id}": { get: {...}, patch: {...} } }`. */
function montarPaths(endpoints: readonly EndpointDoc[]): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of endpoints) {
    const operacoes = paths[endpoint.caminho] ?? {};
    operacoes[endpoint.metodo.toLowerCase()] = montarOperacao(endpoint);
    paths[endpoint.caminho] = operacoes;
  }
  return paths;
}

const ENDPOINT_OPENAPI_JSON: EndpointDoc = {
  metodo: 'GET',
  caminho: '/openapi.json',
  escopo: 'read',
  tag: 'Sistema',
  resumo: 'Este documento OpenAPI 3.0.3.',
};

const ENDPOINT_PING: EndpointDoc = {
  metodo: 'GET',
  caminho: '/ping',
  escopo: 'read',
  tag: 'Sistema',
  resumo: 'Rota de fumaça — confirma autenticação e escopo de ponta a ponta.',
  descricao: 'Devolve `{ ok, donoId, tokenId, escopos, hoje }`. Útil para validar um token recém-criado.',
};

/**
 * Todo endpoint documentado, incluindo os dois que não vêm dos 4 grupos de
 * negócio (`/openapi.json` e `/ping`) — exportado para o teste de bijeção
 * comparar 1:1 contra o filesystem sem reimplementar esta lista.
 */
export const ENDPOINTS_DOCUMENTADOS: readonly EndpointDoc[] = [
  ...TODOS_OS_ENDPOINTS,
  ENDPOINT_OPENAPI_JSON,
  ENDPOINT_PING,
];

/**
 * Monta o documento OpenAPI 3.0.3 completo. Pura — chamável de teste e de
 * rota sem diferença de comportamento.
 */
export function montarDocumentoOpenApi(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Controle Financeiro Pessoal — API do Agente',
      version: '1.0.0',
      description:
        'API REST para um agente de IA externo operar o mesmo motor de finanças pessoais da tela Hoje. ' +
        `${NOTA_CENTS_E_FMT}\n\n` +
        'Data civil é sempre string "YYYY-MM-DD" (nunca datetime) em todo campo que representa um dia. ' +
        'A verba do ciclo em curso é CONGELADA: editar Config/custos fixos/provisões só afeta o PRÓXIMO ' +
        'ciclo, exceto quando a resposta de escrita trouxer `efeitoNoCicloAtual.recalculou: true`. ' +
        'Custo fixo NUNCA cria `Transacao` — é rastreado por `PagamentoFixo`, já descontado na verba quando ' +
        'o ciclo nasceu; contá-lo de novo a partir de uma transação duplicaria o valor.',
    },
    servers: [{ url: '/api/agent/v1' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Sistema' },
      { name: 'Transações' },
      { name: 'Categorias' },
      { name: 'Contas' },
      { name: 'Custos fixos' },
      { name: 'Provisões' },
      { name: 'Config' },
      { name: 'Patrimônio' },
      { name: 'Ciclos' },
      { name: 'Importação' },
      { name: 'Auditoria' },
    ],
    paths: montarPaths(ENDPOINTS_DOCUMENTADOS),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'mfa_...',
          description:
            'Token criado em `/config/tokens` (OWNER), prefixo `mfa_`. Escopos ADITIVOS: ' +
            '`admin` ⊇ `write` ⊇ `read` — um token `write` também satisfaz rota que exige `read`.',
        },
      },
      schemas: { Erro: ESQUEMA_ERRO },
    },
  };
}
