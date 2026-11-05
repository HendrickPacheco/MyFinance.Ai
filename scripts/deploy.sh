#!/usr/bin/env bash
# Deploy de producao (Docker Compose). Chamado por scripts/deploy-entrada.sh,
# que ja segurou a trava e fez o `git pull --ff-only`.
#
#   scripts/deploy.sh <sha-que-estava-em-producao>
#
# O que faz, nesta ordem:
#   1. guarda a imagem atual como myfinanceai-app:previous (para rollback)
#   2. builda a imagem nova (o container atual segue no ar)
#   3. so se houver migration pendente: pg_dump -Fc em /root/backups e depois
#      `prisma migrate deploy` (NUNCA migrate dev/reset/db push)
#   4. recria o container do app (o Prisma Client novo so carrega reiniciando)
#   5. health check: /login 200 e / redireciona
#   6. se o health check falhar: volta a imagem e o commit anteriores.
#      Migration ja aplicada NAO e desfeita sozinha; o script avisa onde esta o
#      backup.
#
# As migrations rodam com `--entrypoint prisma` para nao passar pelo fallback
# do docker-entrypoint.sh (que tentaria `migrate resolve` + seed-owner).
#
# A saida padrao vai para o log PUBLICO do GitHub Actions (o repo e publico):
# so mensagens curtas aqui. Saida de build/prisma/logs do app vai para
# $DEPLOY_LOG, que fica so na VPS.

main() {
  set -Eeuo pipefail

  local PREV="${1:?uso: deploy.sh <sha-anterior>}"
  local REPO=/opt/apps/MyFinance.Ai
  local BACKUPS=/root/backups
  local IMAGEM=myfinanceai-app
  local LOG="${DEPLOY_LOG:-/dev/null}"
  local NEW
  cd "$REPO"
  NEW=$(git rev-parse HEAD)

  log() { printf '==> %s\n' "$*" | tee -a "$LOG"; }
  detalhe() { "$@" >>"$LOG" 2>&1; }
  prisma() {
    docker compose run --rm --no-deps -T --entrypoint prisma app "$@" 2>&1 | sed '/[│┌└]/d'
  }
  saudavel() {
    local i login raiz
    for i in $(seq 1 45); do
      login=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login || true)
      raiz=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ || true)
      if [ "$login" = 200 ] && [ "$raiz" = 307 ]; then return 0; fi
      sleep 2
    done
    log "health check falhou: /login=$login /=$raiz"
    return 1
  }
  voltar_commit() {
    detalhe git reset --hard "$PREV"
  }

  log "deploy ${PREV:0:7} -> ${NEW:0:7}: $(git log -1 --format=%s)"

  # 1. imagem de rollback
  if docker image inspect "$IMAGEM:latest" >/dev/null 2>&1; then
    docker tag "$IMAGEM:latest" "$IMAGEM:previous"
  fi

  # 2. build
  log "build da imagem"
  if ! detalhe docker compose build app; then
    log "build falhou; producao intacta, voltando o checkout para ${PREV:0:7}"
    voltar_commit
    exit 1
  fi
  # O build reapontou :latest para a imagem nova. O container em pe continua
  # na antiga ate o `up`.

  # 3. migrations
  local status
  status=$(prisma migrate status || true)
  printf '%s\n' "$status" >>"$LOG"
  if grep -q 'Database schema is up to date' <<<"$status"; then
    log "sem migrations pendentes"
  elif grep -qi 'failed' <<<"$status" || ! grep -q 'have not yet been applied' <<<"$status"; then
    log "migrate status inesperado (migration com falha?); NADA foi aplicado. Veja $LOG"
    docker tag "$IMAGEM:previous" "$IMAGEM:latest"
    voltar_commit
    exit 1
  else
    log "migrations pendentes:"
    sed -n '/have not yet been applied/,/^$/p' <<<"$status" | sed '1d;/^$/d;s/^/      /' | tee -a "$LOG"

    local dump
    dump="$BACKUPS/myfinance-$(date -u +%Y-%m-%d-%H%M)-auto-pre-${NEW:0:7}.dump"
    install -m 700 -d "$BACKUPS"
    log "backup do banco antes de migrar"
    if ! docker exec myfinanceai-db-1 pg_dump -U myfinance -d myfinance -Fc >"$dump" \
      || [ ! -s "$dump" ] \
      || ! docker exec -i myfinanceai-db-1 pg_restore --list <"$dump" >/dev/null; then
      log "backup falhou; NADA foi aplicado"
      docker tag "$IMAGEM:previous" "$IMAGEM:latest"
      voltar_commit
      exit 1
    fi
    chmod 600 "$dump"
    log "backup ok: $dump ($(du -h "$dump" | cut -f1))"

    log "aplicando migrations (prisma migrate deploy)"
    if ! prisma migrate deploy >>"$LOG" 2>&1; then
      log "migrate deploy FALHOU. O app antigo segue no ar. O banco pode ter ficado parcialmente migrado."
      log "Backup: $dump. Investigue antes de reexecutar."
      docker tag "$IMAGEM:previous" "$IMAGEM:latest"
      voltar_commit
      exit 1
    fi
    log "migrations aplicadas"
  fi

  # 4. restart
  log "recriando o container do app"
  detalhe docker compose up -d --no-build app

  # 5. health check
  if saudavel; then
    log "app saudavel em ${NEW:0:7}"
  else
    detalhe docker compose logs --tail 200 app
    log "ROLLBACK: voltando para a imagem e o commit ${PREV:0:7}"
    if [ -n "${dump:-}" ]; then
      log "atencao: as migrations deste deploy CONTINUAM aplicadas (backup pre-migracao: $dump)"
    fi
    docker tag "$IMAGEM:previous" "$IMAGEM:latest"
    voltar_commit
    detalhe docker compose up -d --no-build app
    if saudavel; then
      log "rollback ok; producao em ${PREV:0:7}"
    else
      log "rollback TAMBEM falhou; intervencao manual necessaria"
    fi
    exit 1
  fi

  # 6. faxina: imagens orfas e backups automaticos antigos (mantem 20)
  detalhe docker image prune -f
  { ls -1t "$BACKUPS"/myfinance-*-auto-pre-*.dump 2>/dev/null || true; } | tail -n +21 | xargs -r rm -f --
  log "deploy concluido"
}

# Tudo dentro de main(): o bash le o arquivo inteiro antes de executar, entao
# um pull que altere este script no meio do caminho nao corrompe a execucao.
main "$@"
exit
