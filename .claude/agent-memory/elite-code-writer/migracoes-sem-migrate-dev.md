---
name: migracoes-sem-migrate-dev
description: Neste repo `pnpm db:migrate` (prisma migrate dev) falha sempre — migrações novas têm que ser escritas à mão, aplicadas com `prisma db execute` e marcadas com `prisma migrate resolve --applied`.
metadata:
  type: project
---

`pnpm db:migrate` / `prisma migrate dev` **não funciona neste projeto** e não vai
voltar a funcionar sozinho. Ele aborta com `P3006` ao replicar o histórico no
shadow database:

```
Migration `20260804200000_multi_tenant_dono_id` failed to apply cleanly to the shadow database.
ERROR: Nenhum usuário OWNER encontrado: rode `pnpm db:seed-owner` antes desta migração.
```

**Why:** aquela migração da virada multi-tenant depende de DADOS (um `Usuario`
com papel OWNER já existente) para carimbar o `donoId` das linhas legadas. O
shadow database nasce vazio a cada `migrate dev`, então a migração de 04/08/2026
falha lá dentro para sempre, mesmo quando o banco real está perfeito.

**How to apply:** para criar uma migração nova, o caminho é manual — e é o mesmo
que as migrações escritas à mão do repo já seguem (ver
`20260811120000_item_patrimonio_conta`):

1. editar `prisma/schema.prisma`, depois `prisma format` e `prisma validate`;
2. escrever `prisma/migrations/<timestamp>_<nome>/migration.sql` à mão
   (timestamp no formato `YYYYMMDDHHMMSS`, ex.: `20260824120000`);
3. aplicar com `prisma db execute --file <caminho> --schema prisma/schema.prisma`;
4. registrar com `prisma migrate resolve --applied <nome_da_pasta>`;
5. conferir com `prisma migrate diff --from-schema-datasource prisma/schema.prisma
   --to-schema-datamodel prisma/schema.prisma --script` — o resultado esperado é
   **apenas** `DROP INDEX "Memoria_embedding_hnsw_idx"`, que é falso positivo
   conhecido (índice pgvector criado por SQL cru) e NUNCA deve entrar numa
   migração.

Detalhe de ferramenta: o hook do RTK reescreve `prisma` e quebra (`rtk: No such
file or directory`). Use `rtk proxy pnpm exec prisma ...` para os comandos do
Prisma.
