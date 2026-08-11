/**
 * Guarda de categoria de PARCELA, isolada num módulo próprio (TASKS-CUSTOS
 * §5.1 ticket 6).
 *
 * Mora aqui, e não em `parcelamentos.ts`, por uma razão mecânica: quem também
 * precisa dela é `criarParcelamento`, que vive em `transacoes.ts` — e
 * `parcelamentos.ts` já importa `transacoes.ts` (`aplicarEfeitoSaldo`,
 * `resolverCicloId`). Importar de volta fecharia um ciclo de módulos. A classe
 * de erro segue reexportada por `parcelamentos.ts` para não quebrar quem já a
 * importa de lá.
 */
import type { Deps } from './deps';

/**
 * Lançado ao atribuir a uma parcela uma categoria de grupo diferente de
 * VARIAVEL. Parcela é sempre gasto de verba variável e consome o teto diário
 * como qualquer DESPESA (decisão D-11) — nunca é deduzida da verba por fora.
 * Aceitar categoria FIXO/RENDA faria a parcela deixar de contar em
 * `gastoRealizadoCents` (`contaComoVerbaVariavel` filtra por grupo VARIAVEL),
 * ou seja, a mesma regra D-11 furada pela porta dos fundos.
 */
export class CategoriaInvalidaParaParcelaError extends Error {
  constructor(
    public readonly nomeCategoria: string,
    public readonly grupo: string,
  ) {
    super(
      `Categoria "${nomeCategoria}" é do grupo ${grupo}, não Variável — parcela ` +
        'precisa continuar consumindo o teto diário.',
    );
    this.name = 'CategoriaInvalidaParaParcelaError';
  }
}

/**
 * Categoria nula é um estado geral já aceito pelo cadastro (parcelamento sem
 * categoria) — não é o que este guard cobre. O guard só recusa uma categoria
 * EXISTENTE de grupo errado (FIXO/RENDA) sendo atribuída a uma parcela que
 * ainda pode consumir teto de ciclo ABERTO — ver os pontos de chamada para a
 * exceção de "toda parcela afetada já está em ciclo fechado".
 */
export async function validarCategoriaVariavel(
  deps: Deps,
  categoriaId: string | null,
): Promise<void> {
  if (categoriaId == null) return;

  const categoria = await deps.categorias.obter(categoriaId);
  if (!categoria) throw new Error('Categoria não encontrada.');
  if (categoria.grupo !== 'VARIAVEL') {
    throw new CategoriaInvalidaParaParcelaError(categoria.nome, categoria.grupo);
  }
}
