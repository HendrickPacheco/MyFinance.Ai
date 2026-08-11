-- Feature "CRUD visual de custos + Projeção" (TASKS-CUSTOS.md, fase de schema).
--
-- Migração ADITIVA e nullable: todo campo novo tem default = comportamento
-- anterior, para a suíte de testes existente continuar verde sem ser editada.
--
-- Escrita à mão em vez de gerada por `prisma migrate dev` por dois motivos:
--
-- 1. `migrate dev` usa um shadow database que replaya todas as migrações do
--    zero, e `20260804200000_multi_tenant_dono_id` aborta de propósito quando
--    não há usuário OWNER (guarda correta para o banco real, fatal num banco
--    vazio). O fluxo aqui é: escrever o SQL, aplicar com `prisma db execute`,
--    e registrar com `prisma migrate resolve --applied`.
-- 2. `prisma migrate diff` quer dropar `Memoria_embedding_hnsw_idx`, porque o
--    índice HNSW do pgvector é criado por SQL cru e não existe no
--    schema.prisma. Dropá-lo degradaria a busca da memória do copiloto para
--    varredura sequencial, silenciosamente. Ele fica de fora daqui de propósito.

-- CustoFixo.vigenteDe / vigenteAte — hints de projeção futura. Ciclos já
-- nascidos ignoram (cada Ciclo guarda seu próprio fixosCents congelado).
-- null/null = custo constante para sempre, que é como todos nascem hoje.
ALTER TABLE "CustoFixo"
  ADD COLUMN "vigenteDe"  TEXT,
  ADD COLUMN "vigenteAte" TEXT;

-- Parcelamento.encerradoEm — cancelamento antecipado das parcelas FUTURAS.
-- Não é delete: a FK Transacao.parcelamentoId é Restrict e as parcelas já
-- pagas (e as de ciclo fechado) continuam vivas e contando no histórico.
-- null = em andamento.
ALTER TABLE "Parcelamento"
  ADD COLUMN "encerradoEm" TEXT;
