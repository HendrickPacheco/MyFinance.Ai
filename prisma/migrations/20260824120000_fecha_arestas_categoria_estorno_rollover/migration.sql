-- Fase G0 (TASKS-GRAFO §6): fecha as quatro arestas quebradas do schema.
--
--   1. Parcelamento.categoriaId  -> vira FK de verdade para Categoria
--   2. Transacao.estornoDeId     -> vira self-relation Transacao -> Transacao
--   3. CustoFixo.categoriaId     -> coluna NOVA, nasce null
--   4. Ciclo.cicloAnteriorId     -> coluna NOVA, cadeia de rollover POR DONO
--
-- ATENÇÃO: NÃO inclua aqui o `DROP INDEX "Memoria_embedding_hnsw_idx"` que o
-- `prisma migrate diff` sugere. Esse índice é criado por SQL cru (pgvector não
-- é tipado pelo Prisma), então toda diff acha que ele sobra. Dropá-lo derruba
-- a busca semântica da memória do copiloto.
--
-- ORDEM OBRIGATÓRIA: limpar os órfãos ANTES de criar cada FK. `estornoDeId` e
-- `categoriaId` já têm valores gravados sem nenhuma garantia referencial —
-- criar a constraint com um único id pendurado aborta a migração inteira.

-- AlterTable
ALTER TABLE "CustoFixo" ADD COLUMN "categoriaId" TEXT;
ALTER TABLE "Ciclo" ADD COLUMN "cicloAnteriorId" TEXT;

-- ── Limpeza de órfãos ────────────────────────────────────────────────────────
-- Duas classes de lixo são anuladas aqui, e a segunda é a que importa mais:
--
--   (a) id que não existe mais  -> a FK abortaria a migração;
--   (b) id que existe mas é de OUTRO DONO -> a FK ACEITARIA, e a aresta
--       nasceria cruzando donos. Nenhuma aresta cruza donos (TASKS-GRAFO §7.2),
--       então o `donoId` entra no EXISTS junto com o id.
DO $$
DECLARE
  estornos_limpos INTEGER;
  parcelamentos_limpos INTEGER;
BEGIN
  UPDATE "Transacao" t
     SET "estornoDeId" = NULL
   WHERE t."estornoDeId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM "Transacao" original
        WHERE original."id" = t."estornoDeId"
          AND original."donoId" = t."donoId"
     );
  GET DIAGNOSTICS estornos_limpos = ROW_COUNT;

  UPDATE "Parcelamento" p
     SET "categoriaId" = NULL
   WHERE p."categoriaId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM "Categoria" c
        WHERE c."id" = p."categoriaId"
          AND c."donoId" = p."donoId"
     );
  GET DIAGNOSTICS parcelamentos_limpos = ROW_COUNT;

  RAISE NOTICE 'G0: % Transacao.estornoDeId órfãos anulados', estornos_limpos;
  RAISE NOTICE 'G0: % Parcelamento.categoriaId órfãos anulados', parcelamentos_limpos;
END $$;

-- ── Backfill da cadeia de ciclos ─────────────────────────────────────────────
-- POR DONO (PARTITION BY "donoId"): ligar o ciclo de um dono ao ciclo de outro
-- seria vazamento, e `LAG` sem partição faria exatamente isso na fronteira
-- entre dois donos. O primeiro ciclo de cada dono fica com `NULL`, que é o
-- valor correto — ele não tem anterior.
DO $$
DECLARE
  ciclos_ligados INTEGER;
BEGIN
  WITH cadeia AS (
    SELECT
      "id",
      LAG("id") OVER (PARTITION BY "donoId" ORDER BY "dataInicio") AS anterior
    FROM "Ciclo"
  )
  UPDATE "Ciclo" c
     SET "cicloAnteriorId" = cadeia.anterior
    FROM cadeia
   WHERE cadeia."id" = c."id"
     AND cadeia.anterior IS NOT NULL;
  GET DIAGNOSTICS ciclos_ligados = ROW_COUNT;

  RAISE NOTICE 'G0: % ciclos ligados ao anterior', ciclos_ligados;
END $$;

-- CreateIndex
CREATE INDEX "CustoFixo_categoriaId_idx" ON "CustoFixo"("categoriaId");
CREATE INDEX "Parcelamento_categoriaId_idx" ON "Parcelamento"("categoriaId");
CREATE INDEX "Transacao_estornoDeId_idx" ON "Transacao"("estornoDeId");
CREATE INDEX "Ciclo_cicloAnteriorId_idx" ON "Ciclo"("cicloAnteriorId");

-- AddForeignKey
-- SET NULL em todas: apagar uma categoria não pode apagar o custo fixo nem a
-- compra parcelada, e apagar a transação original não pode apagar o estorno —
-- ele vira lançamento solto, que é exatamente o que já acontecia de fato
-- quando não havia FK nenhuma.
ALTER TABLE "CustoFixo" ADD CONSTRAINT "CustoFixo_categoriaId_fkey"
  FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Parcelamento" ADD CONSTRAINT "Parcelamento_categoriaId_fkey"
  FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_estornoDeId_fkey"
  FOREIGN KEY ("estornoDeId") REFERENCES "Transacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ciclo" ADD CONSTRAINT "Ciclo_cicloAnteriorId_fkey"
  FOREIGN KEY ("cicloAnteriorId") REFERENCES "Ciclo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
