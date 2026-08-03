-- CreateTable
CREATE TABLE "Config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rendaBaseCents" INTEGER NOT NULL,
    "rendaVariavel" BOOLEAN NOT NULL DEFAULT false,
    "diaRecebimento" INTEGER NOT NULL,
    "metaPoupancaCents" INTEGER NOT NULL,
    "metaPoupancaPercent" DOUBLE PRECISION,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "timezone" TEXT NOT NULL DEFAULT 'America/Bahia',
    "destinoSobra" TEXT NOT NULL DEFAULT 'RESERVA',
    "destinoSobraContaId" TEXT,
    "pisoDiarioVerbaCents" INTEGER NOT NULL DEFAULT 1500,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "saldoCents" INTEGER NOT NULL DEFAULT 0,
    "incluiPatrimonio" BOOLEAN NOT NULL DEFAULT true,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Conta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoFixo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valorCents" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "contaId" TEXT,

    CONSTRAINT "CustoFixo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisaoAnual" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valorAnualCents" INTEGER NOT NULL,
    "mesEsperado" INTEGER,
    "acumuladoCents" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProvisaoAnual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "essencial" BOOLEAN NOT NULL DEFAULT false,
    "icone" TEXT,
    "cor" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transacao" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcelamento" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorTotalCents" INTEGER NOT NULL,
    "numParcelas" INTEGER NOT NULL,
    "dataCompra" TEXT NOT NULL,
    "categoriaId" TEXT,

    CONSTRAINT "Parcelamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ciclo" (
    "id" TEXT NOT NULL,
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
    "observacao" TEXT,

    CONSTRAINT "Ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotPatrimonio" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,

    CONSTRAINT "SnapshotPatrimonio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPatrimonio" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "valorCents" INTEGER NOT NULL,

    CONSTRAINT "ItemPatrimonio_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "Config" ADD CONSTRAINT "Config_destinoSobraContaId_fkey" FOREIGN KEY ("destinoSobraContaId") REFERENCES "Conta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustoFixo" ADD CONSTRAINT "CustoFixo_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_contaDestinoId_fkey" FOREIGN KEY ("contaDestinoId") REFERENCES "Conta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_provisaoId_fkey" FOREIGN KEY ("provisaoId") REFERENCES "ProvisaoAnual"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_parcelamentoId_fkey" FOREIGN KEY ("parcelamentoId") REFERENCES "Parcelamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "Ciclo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPatrimonio" ADD CONSTRAINT "ItemPatrimonio_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SnapshotPatrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
