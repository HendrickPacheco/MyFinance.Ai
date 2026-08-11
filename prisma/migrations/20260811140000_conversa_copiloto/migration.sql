-- Persistência de conversas do copiloto (Fase 1 do plano de persistência).
--
-- Escrita à mão, e não gerada por `prisma migrate dev` / `pnpm db:migrate`:
-- a shadow database não consegue replayar `20260804200000_multi_tenant_dono_id`
-- (ela aborta de propósito quando não existe OWNER), então qualquer comando
-- que dependa de shadow database falha neste repositório.
--
-- ATENÇÃO: NÃO inclua aqui o `DROP INDEX "Memoria_embedding_hnsw_idx"` que o
-- `prisma migrate diff` sempre sugere. Esse índice é criado por SQL cru
-- (pgvector não é tipado pelo Prisma), então toda diff acha que ele sobra.
-- Dropá-lo derruba a busca semântica da memória do copiloto.

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensagemConversa" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "proveniencia" JSONB,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemConversa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — regra de ouro do multi-tenant: índice por dono em toda tabela financeira/de conversa.
CREATE INDEX "Conversa_donoId_atualizadaEm_idx" ON "Conversa"("donoId", "atualizadaEm");

-- CreateIndex
CREATE INDEX "MensagemConversa_donoId_conversaId_criadaEm_idx" ON "MensagemConversa"("donoId", "conversaId", "criadaEm");

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_donoId_fkey"
    FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemConversa" ADD CONSTRAINT "MensagemConversa_donoId_fkey"
    FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemConversa" ADD CONSTRAINT "MensagemConversa_conversaId_fkey"
    FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
