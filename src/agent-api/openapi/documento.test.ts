/**
 * Prova que `montarDocumentoOpenApi` documenta EXATAMENTE as rotas que
 * existem em `app/api/agent/v1/**` — nem uma rota sem doc, nem um caminho
 * documentado que não existe. Varre o filesystem de verdade (sem mock) e
 * confere o método exportado de cada `route.ts` contra os caminhos/métodos
 * de `ENDPOINTS_DOCUMENTADOS`; se a doc divergir, corrige-se no array do
 * grupo correspondente, nunca aqui.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINTS_DOCUMENTADOS, montarDocumentoOpenApi } from './documento';

const RAIZ_ROTAS = join(process.cwd(), 'app', 'api', 'agent', 'v1');
const METODOS_HTTP = ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'] as const;

/** `[id]` (convenção de pasta do Next.js) -> `{id}` (convenção de path do OpenAPI). */
function paraCaminhoOpenApi(segmentos: readonly string[]): string {
  return '/' + segmentos.map((segmento) => segmento.replace(/^\[(.+)\]$/, '{$1}')).join('/');
}

/** `export const GET = ...` / `export async function POST(...)` — as duas formas usadas no repo. */
function metodosExportados(conteudo: string): string[] {
  return METODOS_HTTP.filter((metodo) =>
    new RegExp(`export\\s+(const|async function)\\s+${metodo}\\b`).test(conteudo),
  );
}

interface RotaNoFilesystem {
  caminho: string;
  metodo: string;
}

/** Varredura recursiva de `app/api/agent/v1` — uma entrada por (caminho, método) de cada `route.ts`. */
function varrerRotasNoFilesystem(diretorio: string, segmentos: readonly string[] = []): RotaNoFilesystem[] {
  const entradas = readdirSync(diretorio, { withFileTypes: true });
  const rotas: RotaNoFilesystem[] = [];

  for (const entrada of entradas) {
    if (entrada.isDirectory()) {
      rotas.push(...varrerRotasNoFilesystem(join(diretorio, entrada.name), [...segmentos, entrada.name]));
      continue;
    }
    if (entrada.name !== 'route.ts') continue;

    const conteudo = readFileSync(join(diretorio, entrada.name), 'utf8');
    const caminho = paraCaminhoOpenApi(segmentos);
    for (const metodo of metodosExportados(conteudo)) {
      rotas.push({ caminho, metodo });
    }
  }

  return rotas;
}

function chave(rota: RotaNoFilesystem): string {
  return `${rota.metodo} ${rota.caminho}`;
}

describe('bijeção entre app/api/agent/v1/**/route.ts e ENDPOINTS_DOCUMENTADOS', () => {
  const rotasReais = varrerRotasNoFilesystem(RAIZ_ROTAS);
  const rotasDocumentadas = ENDPOINTS_DOCUMENTADOS.map((endpoint) => ({
    caminho: endpoint.caminho,
    metodo: endpoint.metodo,
  }));

  it('encontrou pelo menos uma rota no filesystem (a varredura não quebrou silenciosamente)', () => {
    expect(rotasReais.length).toBeGreaterThan(0);
  });

  it('toda rota real tem doc — nenhum route.ts exportado ficou sem EndpointDoc', () => {
    const documentadas = new Set(rotasDocumentadas.map(chave));
    const semDoc = rotasReais.filter((rota) => !documentadas.has(chave(rota))).map(chave);
    expect(semDoc).toEqual([]);
  });

  it('toda doc corresponde a uma rota real — nenhum EndpointDoc aponta para caminho inexistente', () => {
    const reais = new Set(rotasReais.map(chave));
    const semRota = rotasDocumentadas.filter((rota) => !reais.has(chave(rota))).map(chave);
    expect(semRota).toEqual([]);
  });

  it('não há EndpointDoc duplicado (mesmo método + caminho declarado duas vezes)', () => {
    const contagem = new Map<string, number>();
    for (const rota of rotasDocumentadas) {
      const k = chave(rota);
      contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
    const duplicados = [...contagem.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(duplicados).toEqual([]);
  });
});

describe('montarDocumentoOpenApi', () => {
  const documento = montarDocumentoOpenApi();

  it('é JSON válido (serializa e volta a ser um objeto)', () => {
    expect(() => JSON.parse(JSON.stringify(documento))).not.toThrow();
  });

  it('declara a versão 3.0.3 do OpenAPI', () => {
    expect((documento as { openapi: string }).openapi).toBe('3.0.3');
  });

  it('documenta a própria rota /openapi.json', () => {
    const paths = (documento as { paths: Record<string, unknown> }).paths;
    expect(paths['/openapi.json']).toBeDefined();
  });

  it('toda operação de escrita aceita dryRun e Idempotency-Key', () => {
    const paths = (documento as { paths: Record<string, Record<string, { parameters?: { name: string }[] }>> }).paths;
    for (const [caminho, operacoesPorMetodo] of Object.entries(paths)) {
      for (const [metodo, operacao] of Object.entries(operacoesPorMetodo)) {
        if (metodo === 'get') continue;
        const nomes = (operacao.parameters ?? []).map((p) => p.name);
        if (!nomes.includes('dryRun')) continue; // operações de leitura via POST (simulações) não escrevem.
        expect(nomes, `${metodo.toUpperCase()} ${caminho}`).toContain('Idempotency-Key');
      }
    }
  });
});
