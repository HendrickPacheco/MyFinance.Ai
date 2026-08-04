/**
 * Tradução Zod → JSON Schema para os argumentos de ferramenta.
 *
 * O contrato é declarado UMA vez, em Zod: o mesmo schema que vira JSON Schema
 * para o provedor é o que valida o que o modelo devolve. Nada de manter duas
 * descrições do mesmo argumento em sincronia na mão.
 *
 * O schema sai ESTRITO — `additionalProperties: false` e todo campo listado em
 * `required` — porque é isso que o modo estrito do provedor exige.
 *
 * CONSEQUÊNCIA PARA O CATÁLOGO (D1): argumento de ferramenta não deve usar
 * `.optional()`. Um campo que pode faltar se declara `.nullable()`, que
 * continua obrigatório na chamada e aceita `null` como "não informado".
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';

type ObjetoJson = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is ObjetoJson {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Percorre o schema e força, em todo nó de objeto, `additionalProperties:
 * false` e `required` com TODAS as propriedades.
 */
function tornarEstrito(no: unknown): void {
  if (Array.isArray(no)) {
    for (const item of no) tornarEstrito(item);
    return;
  }
  if (!ehObjeto(no)) return;

  if (no.type === 'object' && ehObjeto(no.properties)) {
    no.additionalProperties = false;
    no.required = Object.keys(no.properties);
  }

  for (const valor of Object.values(no)) tornarEstrito(valor);
}

/**
 * Converte o schema Zod dos argumentos de uma ferramenta em JSON Schema
 * estrito. `nome` só entra na mensagem de erro, para o diagnóstico apontar
 * qual ferramenta está malformada.
 */
export function paraJsonSchemaEstrito(schema: ZodTypeAny, nome: string): ObjetoJson {
  const gerado: unknown = zodToJsonSchema(schema, {
    // Sem `$ref`: o provedor consome melhor um schema inline.
    $refStrategy: 'none',
    target: 'jsonSchema7',
  });

  if (!ehObjeto(gerado)) {
    throw new Error(`Schema de argumentos da ferramenta "${nome}" não gerou um objeto JSON Schema`);
  }

  // O topo tem que ser um objeto: o provedor entrega argumentos como objeto.
  if (gerado.type !== 'object') {
    throw new Error(
      `Argumentos da ferramenta "${nome}" precisam ser um z.object(...) — recebido: ${String(gerado.type)}`,
    );
  }

  tornarEstrito(gerado);
  delete gerado.$schema;
  return gerado;
}
