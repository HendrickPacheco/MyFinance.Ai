-- I1 da importação de fatura (TASKS-IMPORTACAO §15.5).
--
-- Migração escrita à mão: `prisma migrate dev` aborta com P3006 neste repo
-- desde a virada multi-tenant (ver CLAUDE.md). Aplicada com `prisma db execute`
-- e registrada com `prisma migrate resolve --applied`.
--
-- Ordem importa e é responsabilidade nossa: "Importacao" nasce antes de
-- "ItemImportado" (FK), e "ItemImportado" antes das FKs de "Transacao" e
-- "MensagemConversa" que apontam para eles.
--
-- Tudo aqui é ADITIVO: nenhuma coluna existente muda de forma, nome ou tipo.
-- As duas colunas com NOT NULL têm DEFAULT, então as linhas já gravadas são
-- preenchidas sem backfill — toda Transacao existente vira `origem = 'MANUAL'`,
-- que é exatamente o que ela é, e todo Parcelamento vira `parcelaInicial = 1`,
-- que é o comportamento de sempre.

-- D-17 (opção c): de qual parcela o app conhece o parcelamento.
ALTER TABLE "Parcelamento" ADD COLUMN "parcelaInicial" INTEGER NOT NULL DEFAULT 1;

-- Rascunho da importação. Os BYTES do documento não são guardados: só o hash.
CREATE TABLE "Importacao" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "nomeArquivo" TEXT,
    "hashConteudo" TEXT NOT NULL,
    "competenciaRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaEm" TIMESTAMP(3),

    CONSTRAINT "Importacao_pkey" PRIMARY KEY ("id")
);

-- Unicidade COMPOSTA com donoId: sem isso, a fatura de um dono bloquearia o
-- hash do outro (regra de ouro do multi-tenant, CLAUDE.md).
CREATE UNIQUE INDEX "Importacao_donoId_hashConteudo_key" ON "Importacao"("donoId", "hashConteudo");
CREATE INDEX "Importacao_donoId_criadaEm_idx" ON "Importacao"("donoId", "criadaEm");

ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_donoId_fkey"
    FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma linha transcrita da fatura + o veredito da conciliação.
CREATE TABLE "ItemImportado" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricaoOriginal" TEXT NOT NULL,
    "valorCents" INTEGER NOT NULL,
    "sinal" TEXT NOT NULL,
    "data" TEXT,
    "dataOriginalTexto" TEXT NOT NULL,
    "parcelaAtual" INTEGER,
    "parcelaTotal" INTEGER,
    "confianca" TEXT NOT NULL,
    "veredito" TEXT NOT NULL,
    "vereditoMotivo" TEXT NOT NULL,
    "alvoTipo" TEXT,
    "alvoId" TEXT,
    "decisao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "chaveDedup" TEXT NOT NULL,

    CONSTRAINT "ItemImportado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemImportado_donoId_importacaoId_ordem_key" ON "ItemImportado"("donoId", "importacaoId", "ordem");
CREATE INDEX "ItemImportado_donoId_chaveDedup_idx" ON "ItemImportado"("donoId", "chaveDedup");
CREATE INDEX "ItemImportado_importacaoId_idx" ON "ItemImportado"("importacaoId");

ALTER TABLE "ItemImportado" ADD CONSTRAINT "ItemImportado_donoId_fkey"
    FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemImportado" ADD CONSTRAINT "ItemImportado_importacaoId_fkey"
    FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Procedência do lançamento + o caminho de volta para a linha da fatura.
ALTER TABLE "Transacao" ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Transacao" ADD COLUMN "itemImportadoId" TEXT;

-- @unique NO BANCO: um item nunca vira duas transações, mesmo com duplo
-- clique, retry de rede ou duas abas (§11, camada 2). Índice sobre hash não
-- cobriria nada disso.
CREATE UNIQUE INDEX "Transacao_itemImportadoId_key" ON "Transacao"("itemImportadoId");

-- SET NULL, e não CASCADE: descartar o rascunho de uma importação não pode
-- apagar dinheiro já lançado. A transação sobrevive, só perde o rastro.
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_itemImportadoId_fkey"
    FOREIGN KEY ("itemImportadoId") REFERENCES "ItemImportado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Anexo na mensagem do copiloto: nome (para a UI redesenhar a bolha depois de
-- um reload) e FK para o rascunho. Nenhum byte.
ALTER TABLE "MensagemConversa" ADD COLUMN "anexoNome" TEXT;
ALTER TABLE "MensagemConversa" ADD COLUMN "importacaoId" TEXT;

CREATE INDEX "MensagemConversa_importacaoId_idx" ON "MensagemConversa"("importacaoId");

ALTER TABLE "MensagemConversa" ADD CONSTRAINT "MensagemConversa_importacaoId_fkey"
    FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
