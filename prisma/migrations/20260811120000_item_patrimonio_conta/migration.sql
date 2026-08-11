-- Vínculo opcional entre um item de snapshot de patrimônio e uma conta do razão.
-- Permite conciliar o saldo que o app calculou (Conta.saldoCents) com o valor
-- observado no banco e digitado no snapshot (ItemPatrimonio.valorCents).
--
-- ATENÇÃO: NÃO inclua aqui o `DROP INDEX "Memoria_embedding_hnsw_idx"` que o
-- `prisma migrate diff` sugere. Esse índice é criado por SQL cru (pgvector não
-- é tipado pelo Prisma), então toda diff acha que ele sobra. Dropá-lo derruba
-- a busca semântica da memória do copiloto.

-- AlterTable
ALTER TABLE "ItemPatrimonio" ADD COLUMN "contaId" TEXT;

-- CreateIndex
CREATE INDEX "ItemPatrimonio_contaId_idx" ON "ItemPatrimonio"("contaId");

-- AddForeignKey
-- SET NULL: apagar uma conta não pode apagar histórico de patrimônio já fotografado.
ALTER TABLE "ItemPatrimonio" ADD CONSTRAINT "ItemPatrimonio_contaId_fkey"
  FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
