#!/usr/bin/env bash
# Porta de entrada do deploy automatico de producao.
#
# Instalado FORA do repo, em /usr/local/sbin/myfinance-deploy, e usado como
# `command=` (forced command) da chave SSH do GitHub Actions em
# /root/.ssh/authorized_keys. Essa chave nao consegue rodar mais nada.
#
# Fica fora do repo de proposito: ele faz o `git pull`, e um script nao deve
# ser reescrito pelo proprio pull enquanto roda. Depois do pull ele entrega o
# trabalho para scripts/deploy.sh ja na versao nova.
#
# Para reinstalar depois de mudar este arquivo:
#   install -m 755 scripts/deploy-entrada.sh /usr/local/sbin/myfinance-deploy
#
# SSH_ORIGINAL_COMMAND (o que o Actions pediu) so e lido para "force", que
# refaz o deploy mesmo sem commit novo. Qualquer outro valor e ignorado.
set -Eeuo pipefail

REPO=/opt/apps/MyFinance.Ai
LOGDIR=/var/log/myfinance-deploy

exec 9>/run/lock/myfinance-deploy.lock
if ! flock -w 900 9; then
  echo "==> outro deploy segurou a trava por mais de 15 min; abortando"
  exit 1
fi

mkdir -p "$LOGDIR"
export DEPLOY_LOG="$LOGDIR/$(date -u +%Y%m%dT%H%M%SZ).log"
echo "==> log detalhado na VPS: $DEPLOY_LOG"

cd "$REPO"

if [ "$(git branch --show-current)" != main ]; then
  echo "==> o checkout de producao nao esta na main ($(git branch --show-current)); abortando"
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "==> ha mudancas locais nao commitadas em $REPO; abortando sem tocar em nada"
  exit 1
fi

PREV=$(git rev-parse HEAD)
git fetch -q origin main >>"$DEPLOY_LOG" 2>&1
if ! git merge --ff-only -q origin/main >>"$DEPLOY_LOG" 2>&1; then
  echo "==> a main local divergiu de origin/main (fast-forward impossivel); abortando"
  exit 1
fi
NEW=$(git rev-parse HEAD)

if [ "$PREV" = "$NEW" ] && [ "${SSH_ORIGINAL_COMMAND:-}" != force ]; then
  echo "==> nada novo: producao ja esta em ${NEW:0:7}"
  exit 0
fi

exec bash "$REPO/scripts/deploy.sh" "$PREV"
