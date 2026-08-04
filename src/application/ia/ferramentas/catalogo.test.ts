/**
 * Invariantes do catálogo (D1). Estes testes não exercitam ferramenta
 * nenhuma — eles protegem o CONTRATO, que a D2, a D3 e o adapter assumem.
 */
import { describe, expect, it } from 'vitest';
import { ZodObject, type ZodTypeAny } from 'zod';
import { paraJsonSchemaEstrito } from '@/infrastructure/ia/esquema-json';
import {
  CATALOGO_FERRAMENTAS,
  FERRAMENTAS_BLOQUEADAS,
  FERRAMENTAS_COM_VERBA,
  FERRAMENTAS_LIBERADAS,
  definicoesParaProvedor,
} from './catalogo';

const MINIMO_EXIGIDO = [
  'situacao_hoje',
  'estado_ciclo',
  'gastos_por_categoria',
  'analise_corte',
  'assinaturas_detectadas',
  'patrimonio_resumo',
  'pagamentos_pendentes',
  'projetar_ciclos',
  'simular_compra_parcelada',
];

describe('catálogo de ferramentas', () => {
  it('cobre no mínimo as ferramentas exigidas pela D1', () => {
    const nomes = CATALOGO_FERRAMENTAS.map((f) => f.nome);
    for (const exigida of MINIMO_EXIGIDO) {
      expect(nomes).toContain(exigida);
    }
  });

  it('não tem nome duplicado e usa snake_case', () => {
    const nomes = CATALOGO_FERRAMENTAS.map((f) => f.nome);

    expect(new Set(nomes).size).toBe(nomes.length);
    for (const nome of nomes) {
      expect(nome, `${nome} deveria ser snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('toda ferramenta declara origem e comoFoiCalculado apontando para código real', () => {
    for (const f of CATALOGO_FERRAMENTAS) {
      expect(f.origem, `${f.nome} sem origem`).toMatch(/\.ts: \w/);
      expect(f.comoFoiCalculado, `${f.nome} sem comoFoiCalculado`).toMatch(/\.ts: \w/);
      expect(f.descricao.length, `${f.nome} com descrição curta demais`).toBeGreaterThan(40);
    }
  });

  it('nenhuma ferramenta é de escrita', () => {
    const proibido = /(criar|lancar|lançar|atualizar|excluir|fechar|salvar|marcar|pagar)/i;

    for (const f of CATALOGO_FERRAMENTAS) {
      expect(f.nome, `${f.nome} tem cara de escrita`).not.toMatch(proibido);
    }
  });

  it('argumentos são sempre z.object e nunca usam .optional()', () => {
    for (const f of CATALOGO_FERRAMENTAS) {
      expect(f.argumentos, `${f.nome} não é z.object`).toBeInstanceOf(ZodObject);

      const shape = (f.argumentos as ZodObject<Record<string, ZodTypeAny>>).shape;
      for (const [campo, tipo] of Object.entries(shape)) {
        expect(tipo.isOptional(), `${f.nome}.${campo} usa .optional() — use .nullable()`).toBe(
          false,
        );
      }
    }
  });

  it('todo schema vira JSON Schema estrito, com todos os campos em required', () => {
    for (const f of CATALOGO_FERRAMENTAS) {
      const schema = paraJsonSchemaEstrito(f.argumentos, f.nome);

      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);

      const propriedades = Object.keys((schema.properties as Record<string, unknown>) ?? {});
      expect(schema.required ?? []).toEqual(propriedades);
    }
  });

  it('as ferramentas de verba existem no catálogo', () => {
    const nomes = CATALOGO_FERRAMENTAS.map((f) => f.nome);
    for (const nome of FERRAMENTAS_COM_VERBA) {
      expect(nomes).toContain(nome);
    }
  });

  it('nenhuma origem passa por read-model que cria ciclo (D1.5)', () => {
    // `obterEstadoHoje`, `obterEstadoCiclo` e `obterEstadoPainel` chamam
    // `garantirCicloAtual`, que grava. As tools usam as variantes read-only.
    const queGravam = ['obterEstadoHoje', 'obterEstadoCiclo', 'obterEstadoPainel'];

    for (const f of CATALOGO_FERRAMENTAS) {
      for (const proibida of queGravam) {
        const usaVariantePerigosa = new RegExp(`${proibida}(?!SomenteLeitura)\\b`).test(f.origem);
        expect(usaVariantePerigosa, `${f.nome} usa ${proibida}, que cria ciclo`).toBe(false);
      }
    }
  });

  it('não há ferramenta bloqueada — a D2 pode implementar todas', () => {
    expect(FERRAMENTAS_BLOQUEADAS).toHaveLength(0);
    expect(FERRAMENTAS_LIBERADAS).toHaveLength(CATALOGO_FERRAMENTAS.length);
  });

  it('liberadas e bloqueadas particionam o catálogo', () => {
    expect(FERRAMENTAS_LIBERADAS.length + FERRAMENTAS_BLOQUEADAS.length).toBe(
      CATALOGO_FERRAMENTAS.length,
    );
    for (const f of FERRAMENTAS_BLOQUEADAS) {
      expect(f.bloqueio, `${f.nome} bloqueada sem explicação`).toBeTruthy();
    }
  });

  it('definicoesParaProvedor não vaza metadado interno', () => {
    for (const definicao of definicoesParaProvedor()) {
      expect(Object.keys(definicao).sort()).toEqual(['argumentos', 'descricao', 'nome']);
    }
  });
});
