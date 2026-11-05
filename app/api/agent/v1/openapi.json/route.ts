import { rotaAgente } from '@/agent-api';
import { montarDocumentoOpenApi } from '@/agent-api/openapi/documento';

export const dynamic = 'force-dynamic';

/**
 * Devolve o documento OpenAPI 3.0.3 da API do agente. `rotaAgente` passa a
 * resposta por `comFmt` (adiciona `<campo>Fmt` ao lado de todo `<campo>Cents`
 * numérico) — inofensivo aqui: um JSON Schema representa `"...Cents"` como um
 * OBJETO de constraints (`{ type: "integer", minimum: 0 }`), nunca como o
 * número em si, então `comFmt` nunca encontra um valor numérico para formatar
 * sob essas chaves. Fica na mesma via de autenticação/rate-limit das demais
 * rotas em vez de reimplementar isso aqui.
 */
export const GET = rotaAgente({ escopo: 'read' }, async () => montarDocumentoOpenApi());
