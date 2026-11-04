-- Fundação da API do agente de IA externo (feat/agent-api-v1).
-- Três tabelas aditivas: nenhuma coluna financeira existente é tocada.
--
--   ApiToken            credencial do agente (só o hash SHA-256 fica gravado)
--   AuditoriaAgente      trilha de toda escrita do agente
--   IdempotenciaAgente   replay de `Idempotency-Key` (24h)
--
-- Sem backfill: são tabelas novas, sem linha nenhuma a migrar.

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "escopos" TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaAgente" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaAgente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotenciaAgente" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "hashCorpo" TEXT NOT NULL,
    "statusHttp" INTEGER NOT NULL,
    "resposta" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotenciaAgente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_hash_key" ON "ApiToken"("hash");

-- CreateIndex
CREATE INDEX "ApiToken_donoId_idx" ON "ApiToken"("donoId");

-- CreateIndex
CREATE INDEX "AuditoriaAgente_donoId_criadoEm_idx" ON "AuditoriaAgente"("donoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotenciaAgente_donoId_chave_key" ON "IdempotenciaAgente"("donoId", "chave");

-- CreateIndex
CREATE INDEX "IdempotenciaAgente_expiraEm_idx" ON "IdempotenciaAgente"("expiraEm");

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaAgente" ADD CONSTRAINT "AuditoriaAgente_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaAgente" ADD CONSTRAINT "AuditoriaAgente_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotenciaAgente" ADD CONSTRAINT "IdempotenciaAgente_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotenciaAgente" ADD CONSTRAINT "IdempotenciaAgente_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
