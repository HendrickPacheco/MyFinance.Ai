-- Virada MULTI-TENANT: cada usuário passa a ser dono do próprio conjunto de
-- finanças. Escrita à mão (não gerada) porque `donoId` é NOT NULL sobre tabelas
-- JÁ POPULADAS com os dados reais do dono: a coluna precisa nascer nula, receber
-- backfill e só então ganhar a restrição.
--
-- O dono de tudo que já existe é o OWNER mais antigo — o único usuário até aqui.

-- Falha cedo e com mensagem clara se não houver OWNER para herdar os dados,
-- em vez de deixar a migração quebrar adiante com "null value violates not-null".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Usuario" WHERE "papel" = 'OWNER') THEN
    RAISE EXCEPTION 'Nenhum usuário OWNER encontrado: rode `pnpm db:seed-owner` antes desta migração.';
  END IF;
END $$;

-- ── 1. Coluna nullable ──────────────────────────────────────────────────────
ALTER TABLE "Conta"              ADD COLUMN "donoId" TEXT;
ALTER TABLE "Categoria"          ADD COLUMN "donoId" TEXT;
ALTER TABLE "CustoFixo"          ADD COLUMN "donoId" TEXT;
ALTER TABLE "PagamentoFixo"      ADD COLUMN "donoId" TEXT;
ALTER TABLE "ProvisaoAnual"      ADD COLUMN "donoId" TEXT;
ALTER TABLE "Transacao"          ADD COLUMN "donoId" TEXT;
ALTER TABLE "Parcelamento"       ADD COLUMN "donoId" TEXT;
ALTER TABLE "Ciclo"              ADD COLUMN "donoId" TEXT;
ALTER TABLE "SnapshotPatrimonio" ADD COLUMN "donoId" TEXT;
ALTER TABLE "Config"             ADD COLUMN "donoId" TEXT;

-- ── 2. Backfill: tudo que existe hoje é do OWNER ────────────────────────────
UPDATE "Conta"              SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "Categoria"          SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "CustoFixo"          SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "PagamentoFixo"      SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "ProvisaoAnual"      SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "Transacao"          SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "Parcelamento"       SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "Ciclo"              SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "SnapshotPatrimonio" SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);
UPDATE "Config"             SET "donoId" = (SELECT "id" FROM "Usuario" WHERE "papel" = 'OWNER' ORDER BY "criadoEm" LIMIT 1);

-- ── 3. Agora sim, NOT NULL ──────────────────────────────────────────────────
ALTER TABLE "Conta"              ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "Categoria"          ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "CustoFixo"          ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "PagamentoFixo"      ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "ProvisaoAnual"      ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "Transacao"          ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "Parcelamento"       ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "Ciclo"              ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "SnapshotPatrimonio" ALTER COLUMN "donoId" SET NOT NULL;
ALTER TABLE "Config"             ALTER COLUMN "donoId" SET NOT NULL;

-- ── 4. Config deixa de ser singleton `id=1` ─────────────────────────────────
-- A identidade real do registro passa a ser `donoId`; `id` vira só uma chave
-- técnica com sequence.
CREATE SEQUENCE "Config_id_seq" OWNED BY "Config"."id";
SELECT setval('"Config_id_seq"', COALESCE((SELECT MAX("id") FROM "Config"), 1));
ALTER TABLE "Config" ALTER COLUMN "id" SET DEFAULT nextval('"Config_id_seq"');
CREATE UNIQUE INDEX "Config_donoId_key" ON "Config"("donoId");

-- ── 5. Unicidades GLOBAIS viram POR DONO ────────────────────────────────────
-- Sem isto, dois usuários não poderiam ter uma categoria "Mercado" cada um,
-- nem um ciclo começando no mesmo dia.
DROP INDEX "Categoria_nome_key";
CREATE UNIQUE INDEX "Categoria_donoId_nome_key" ON "Categoria"("donoId", "nome");

DROP INDEX "Ciclo_dataInicio_key";
CREATE UNIQUE INDEX "Ciclo_donoId_dataInicio_key" ON "Ciclo"("donoId", "dataInicio");

DROP INDEX "SnapshotPatrimonio_data_key";
CREATE UNIQUE INDEX "SnapshotPatrimonio_donoId_data_key" ON "SnapshotPatrimonio"("donoId", "data");

-- ── 6. Índices de leitura por dono ──────────────────────────────────────────
CREATE INDEX "Conta_donoId_idx"              ON "Conta"("donoId");
CREATE INDEX "Categoria_donoId_idx"          ON "Categoria"("donoId");
CREATE INDEX "CustoFixo_donoId_idx"          ON "CustoFixo"("donoId");
CREATE INDEX "PagamentoFixo_donoId_idx"      ON "PagamentoFixo"("donoId");
CREATE INDEX "ProvisaoAnual_donoId_idx"      ON "ProvisaoAnual"("donoId");
CREATE INDEX "Transacao_donoId_idx"          ON "Transacao"("donoId");
CREATE INDEX "Parcelamento_donoId_idx"       ON "Parcelamento"("donoId");
CREATE INDEX "Ciclo_donoId_idx"              ON "Ciclo"("donoId");
CREATE INDEX "SnapshotPatrimonio_donoId_idx" ON "SnapshotPatrimonio"("donoId");

-- ── 7. FKs: apagar o usuário leva as finanças dele junto ────────────────────
ALTER TABLE "Conta"              ADD CONSTRAINT "Conta_donoId_fkey"              FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Categoria"          ADD CONSTRAINT "Categoria_donoId_fkey"          FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustoFixo"          ADD CONSTRAINT "CustoFixo_donoId_fkey"          FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PagamentoFixo"      ADD CONSTRAINT "PagamentoFixo_donoId_fkey"      FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProvisaoAnual"      ADD CONSTRAINT "ProvisaoAnual_donoId_fkey"      FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transacao"          ADD CONSTRAINT "Transacao_donoId_fkey"          FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Parcelamento"       ADD CONSTRAINT "Parcelamento_donoId_fkey"       FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ciclo"              ADD CONSTRAINT "Ciclo_donoId_fkey"              FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SnapshotPatrimonio" ADD CONSTRAINT "SnapshotPatrimonio_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Config"             ADD CONSTRAINT "Config_donoId_fkey"             FOREIGN KEY ("donoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
