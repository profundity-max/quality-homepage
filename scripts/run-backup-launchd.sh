#!/usr/bin/env bash
# launchd 调用的备份包装：加载 .env 并在 Compose 栈内执行加密备份。
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
set -a
source "$REPO_ROOT/.env"
set +a
cd "$REPO_ROOT"
docker compose --profile operations run --rm backup "$1" "$BACKUP_ADMIN_USER_ID" \
  >> "$REPO_ROOT/logs/backup.log" 2>&1
