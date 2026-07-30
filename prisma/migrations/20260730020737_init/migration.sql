-- CreateTable
CREATE TABLE "Config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "rendaBaseCents" INTEGER NOT NULL,
    "rendaVariavel" BOOLEAN NOT NULL DEFAULT false,
    "diaRecebimento" INTEGER NOT NULL,
    "metaPoupancaCents" INTEGER NOT NULL,
    "metaPoupancaPercent" REAL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "timezone" TEXT NOT NULL DEFAULT 'America/Bahia',
    "destinoSobra" TEXT NOT NULL DEFAULT 'RESERVA',
    "destinoSobraContaId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Config_destinoSobraContaId_fkey" FOREIGN KEY ("destinoSobraContaId") REFERENCES "Conta" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "saldoCents" INTEGER NOT NULL DEFAULT 0,
    "incluiPatrimonio" BOOLEAN NOT NULL DEFAULT true,
    "arquivada" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "CustoFixo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "valorCents" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "contaId" TEXT,
    CONSTRAINT "CustoFixo_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "Conta" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProvisaoAnual" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "valorAnualCents" INTEGER NOT NULL,
    "mesEsperado" INTEGER,
    "acumuladoCents" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "essencial" BOOLEAN NOT NULL DEFAULT false,
    "icone" TEXT,
    "cor" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Transacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "valorCents" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "metodo" TEXT,
    "categoriaId" TEXT,
    "contaId" TEXT,
    "contaDestinoId" TEXT,
    "provisaoId" TEXT,
    "parcelamentoId" TEXT,
    "parcelaNum" INTEGER,
    "estornoDeId" TEXT,
    "cicloId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transacao_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transacao_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "Conta" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transacao_contaDestinoId_fkey" FOREIGN KEY ("contaDestinoId") REFERENCES "Conta" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transacao_provisaoId_fkey" FOREIGN KEY ("provisaoId") REFERENCES "ProvisaoAnual" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transacao_parcelamentoId_fkey" FOREIGN KEY ("parcelamentoId") REFERENCES "Parcelamento" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transacao_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "Ciclo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Parcelamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "descricao" TEXT NOT NULL,
    "valorTotalCents" INTEGER NOT NULL,
    "numParcelas" INTEGER NOT NULL,
    "dataCompra" TEXT NOT NULL,
    "categoriaId" TEXT
);

-- CreateTable
CREATE TABLE "Ciclo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataInicio" TEXT NOT NULL,
    "dataFim" TEXT NOT NULL,
    "rendaPrevistaCents" INTEGER NOT NULL,
    "rendaRealizadaCents" INTEGER,
    "poupancaAlvoCents" INTEGER NOT NULL,
    "fixosCents" INTEGER NOT NULL,
    "provisaoMensalCents" INTEGER NOT NULL,
    "verbaVariavelCents" INTEGER NOT NULL,
    "rolloverRecebidoCents" INTEGER NOT NULL DEFAULT 0,
    "fechado" BOOLEAN NOT NULL DEFAULT false,
    "fechadoEm" TEXT,
    "sobraCents" INTEGER,
    "observacao" TEXT
);

-- CreateTable
CREATE TABLE "SnapshotPatrimonio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ItemPatrimonio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "valorCents" INTEGER NOT NULL,
    CONSTRAINT "ItemPatrimonio_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SnapshotPatrimonio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nome_key" ON "Categoria"("nome");

-- CreateIndex
CREATE INDEX "Transacao_data_idx" ON "Transacao"("data");

-- CreateIndex
CREATE INDEX "Transacao_cicloId_idx" ON "Transacao"("cicloId");

-- CreateIndex
CREATE INDEX "Transacao_categoriaId_idx" ON "Transacao"("categoriaId");

-- CreateIndex
CREATE INDEX "Transacao_provisaoId_idx" ON "Transacao"("provisaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Ciclo_dataInicio_key" ON "Ciclo"("dataInicio");

-- CreateIndex
CREATE UNIQUE INDEX "SnapshotPatrimonio_data_key" ON "SnapshotPatrimonio"("data");
