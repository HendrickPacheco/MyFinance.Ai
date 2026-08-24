/**
 * O vocabulário de "categoria que não dá para nomear", em UM lugar só.
 *
 * Estes três valores viviam em três cópias — `agregacoes.ts`,
 * `destino-da-renda.ts` e um literal cravado no componente de tela — e as
 * cópias já divergiam: a sentinela do agrupamento por categoria era
 * `'__sem-categoria__'` num arquivo e `' sem-categoria'` no outro.
 *
 * A sentinela é a parte perigosa da duplicação. Ela é a CHAVE de um `Map` que
 * precisa distinguir `null` de um `categoriaId` real; duas agregações do mesmo
 * conceito com sentinelas diferentes agrupam diferente, e nada quebra — só os
 * números deixam de bater entre duas telas que deveriam concordar.
 */

/**
 * Chave interna do balde "sem categoria" nas agregações por `categoriaId`.
 * Nenhum `cuid()` do Prisma começa com `_`, então a colisão com um id real é
 * impossível por construção. Serve também de `key` de lista na UI, pelo mesmo
 * motivo.
 */
export const SEM_CATEGORIA_ID = '__sem-categoria__';

/** Lançamento ou custo fixo sem `categoriaId` — aparece, com contagem (D-14). */
export const ROTULO_SEM_CATEGORIA = 'Sem categoria';

/** Categoria que existiu, foi apagada do cadastro e ainda tem histórico apontando para ela. */
export const ROTULO_CATEGORIA_REMOVIDA = 'Categoria removida';
