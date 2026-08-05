-- Memória do copiloto (Fase E, tarefa E1).
--
-- Escrita à mão, e não gerada por `prisma migrate dev`, por dois motivos:
--   1. o Prisma não emite `CREATE EXTENSION`, e sem a extensão o tipo
--      `vector(1536)` não existe — banco novo não subiria;
--   2. o Prisma não cria índice vetorial (HNSW), que é o que faz a busca
--      semântica não virar varredura de tabela.
--
-- Pré-requisito de máquina: pgvector compilado contra o PostgreSQL 16
-- (ver TASKS-IA.md §11.1). Sem ele, o CREATE EXTENSION abaixo falha.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "Memoria" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'USUARIO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memoria_pkey" PRIMARY KEY ("id")
);

-- Regra de ouro do multi-tenant: índice por dono em toda tabela financeira.
CREATE INDEX "Memoria_donoId_tipo_ativo_idx" ON "Memoria"("donoId", "tipo", "ativo");
CREATE INDEX "Memoria_donoId_ativo_createdAt_idx" ON "Memoria"("donoId", "ativo", "createdAt");

ALTER TABLE "Memoria" ADD CONSTRAINT "Memoria_donoId_fkey"
    FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice vetorial. `vector_cosine_ops` porque a busca usa o operador `<=>`
-- (distância de cosseno) — um índice criado para outro operador simplesmente
-- não seria usado, e a consulta degradaria para sequential scan em silêncio.
CREATE INDEX "Memoria_embedding_hnsw_idx"
    ON "Memoria" USING hnsw ("embedding" vector_cosine_ops);
