-- AlterTable
ALTER TABLE "Transacao" ADD COLUMN     "pagoEm" TEXT;

-- CreateTable
CREATE TABLE "PagamentoFixo" (
    "id" TEXT NOT NULL,
    "custoFixoId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "pagoEm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagamentoFixo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagamentoFixo_cicloId_idx" ON "PagamentoFixo"("cicloId");

-- CreateIndex
CREATE UNIQUE INDEX "PagamentoFixo_custoFixoId_cicloId_key" ON "PagamentoFixo"("custoFixoId", "cicloId");

-- AddForeignKey
ALTER TABLE "PagamentoFixo" ADD CONSTRAINT "PagamentoFixo_custoFixoId_fkey" FOREIGN KEY ("custoFixoId") REFERENCES "CustoFixo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoFixo" ADD CONSTRAINT "PagamentoFixo_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "Ciclo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
