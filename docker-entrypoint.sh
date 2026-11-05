#!/bin/sh
set -e

# Migration que exige um OWNER ja existente: ela e a virada multi-tenant e faz
# backfill de `donoId` sobre tabelas populadas, entao aborta com RAISE EXCEPTION
# se nao houver dono. Em banco NOVO isso e um ovo-e-galinha: as tres primeiras
# migrations criam a tabela Usuario, o seed cria o OWNER, e so entao o resto
# pode ser aplicado.
MIGRATION_GATE=20260804200000_multi_tenant_dono_id

echo "==> aplicando migrations"
if prisma migrate deploy; then
  echo "==> migrations em dia"
else
  echo "==> deploy interrompido; tentando bootstrap do OWNER"

  # A migration barrada fica marcada como falha e trava qualquer deploy futuro.
  # Ela aborta na PRIMEIRA instrucao (a checagem do OWNER), dentro da transacao
  # do Prisma, entao nada dela chegou ao banco: marcar como revertida e fiel ao
  # estado real, nao um remendo.
  prisma migrate resolve --rolled-back "$MIGRATION_GATE"

  # Idempotente: se o OWNER ja existe, confirma papel/estado e NAO toca na senha.
  echo "==> criando o usuario OWNER (prisma/seed-owner.ts)"
  tsx prisma/seed-owner.ts

  echo "==> reaplicando migrations"
  prisma migrate deploy
fi

echo "==> subindo o app"
exec "$@"
