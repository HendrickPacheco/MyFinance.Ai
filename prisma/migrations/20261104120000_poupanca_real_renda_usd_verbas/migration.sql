-- Poupança real, renda em USD, tipoVerba e tabela Cotacao. Estritamente ADITIVA.
-- O backfill de Categoria.tipoVerba é por NOME (categorias são por dono, ids cuid
-- não são estáveis); tudo que não está na lista fica EXTRA pelo default.
-- Sem DROP INDEX do HNSW de Memoria: o falso positivo do migrate diff é esperado.

ALTER TABLE "Config" ADD COLUMN "moedaRenda" TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE "Config" ADD COLUMN "rendaBrutaMoedaOrigemCents" INTEGER;
ALTER TABLE "Config" ADD COLUMN "impostoEstimadoCents" INTEGER;
ALTER TABLE "Config" ADD COLUMN "impostoEstimadoPercentual" DOUBLE PRECISION;
ALTER TABLE "Config" ADD COLUMN "fonteRenda" TEXT;

ALTER TABLE "Ciclo" ADD COLUMN "poupancaRealCents" INTEGER;
ALTER TABLE "Ciclo" ADD COLUMN "patrimonioInicialCents" INTEGER;
ALTER TABLE "Ciclo" ADD COLUMN "patrimonioFinalCents" INTEGER;
ALTER TABLE "Ciclo" ADD COLUMN "fonteMedicaoPoupanca" TEXT;
ALTER TABLE "Ciclo" ADD COLUMN "rendaRealBrutaMoedaOrigemCents" INTEGER;
ALTER TABLE "Ciclo" ADD COLUMN "cotacaoRealUsadaMicros" INTEGER;
ALTER TABLE "Ciclo" ADD COLUMN "impostoRealCents" INTEGER;
ALTER TABLE "Ciclo" ADD COLUMN "rendaRealLiquidaCents" INTEGER;
ALTER TABLE "Ciclo" ADD COLUMN "cotacaoPrevistaMicros" INTEGER;
ALTER TABLE "Ciclo" ADD COLUMN "cotacaoPrevistaData" TEXT;

ALTER TABLE "Categoria" ADD COLUMN "tipoVerba" TEXT NOT NULL DEFAULT 'EXTRA';
ALTER TABLE "Transacao" ADD COLUMN "tipoVerbaOverride" TEXT;

UPDATE "Categoria" SET "tipoVerba" = 'DIA_A_DIA'
 WHERE "nome" IN ('Mercado','Delivery','Restaurante','Transporte','Combustível','Farmácia');

CREATE TABLE "Cotacao" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "moedaOrigem" TEXT NOT NULL,
    "moedaDestino" TEXT NOT NULL,
    "taxaMicros" INTEGER NOT NULL,
    "fonte" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cotacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cotacao_data_moedaOrigem_moedaDestino_key" ON "Cotacao"("data", "moedaOrigem", "moedaDestino");
