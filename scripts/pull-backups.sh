#!/bin/bash
# 周四 13:40（北京时间）离机拉取；--if-due 用于每半小时检查和离线补拉。
set -euo pipefail
export TZ=Asia/Shanghai
SERVER="${Q_NEXUS_BACKUP_HOST:-quality-server}"
REMOTE_DIR="${Q_NEXUS_REMOTE_BACKUPS:-/Users/quality/q-nexus/.data/backups}"
LOCAL_DIR="${Q_NEXUS_LOCAL_BACKUPS:-$HOME/Q-Nexus-Backups}"
mkdir -p "$LOCAL_DIR"
case "${1:-}" in
  ""|--if-due) ;;
  *) echo "Usage: $0 [--if-due]" >&2; exit 2 ;;
esac
if [[ "${1:-}" == --if-due ]]; then
  now=$(date +%s)
  weekday=$(date +%u)
  midnight=$(date -v0H -v0M -v0S +%s)
  due=$((midnight - ((weekday + 3) % 7) * 86400 + 49200))
  if (( now < due )); then due=$((due - 604800)); fi
  last=0
  if [[ -f "$LOCAL_DIR/last-success" ]]; then read -r last < "$LOCAL_DIR/last-success"; fi
  [[ "$last" =~ ^[0-9]+$ ]] || last=0
  if (( last >= due )); then exit 0; fi
fi
# 主动任务与补拉任务共用锁，避免同时写入。
if [[ -f "$LOCAL_DIR/.sync-lock/pid" ]]; then
  read -r owner < "$LOCAL_DIR/.sync-lock/pid" || owner=""
  if [[ "$owner" =~ ^[0-9]+$ ]] && ! kill -0 "$owner" 2>/dev/null; then
    rm -f "$LOCAL_DIR/.sync-lock/pid"
    rmdir "$LOCAL_DIR/.sync-lock" 2>/dev/null || true
  fi
fi
if ! mkdir "$LOCAL_DIR/.sync-lock" 2>/dev/null; then
  echo "另一个备份同步正在运行，请稍后重试。" >&2; exit 75
fi
echo "$$" > "$LOCAL_DIR/.sync-lock/pid"
manifest=""
trap 'rm -f "$manifest" "$LOCAL_DIR/.sync-lock/pid"; rmdir "$LOCAL_DIR/.sync-lock"' EXIT
manifest=$(mktemp "$LOCAL_DIR/.checksums.XXXXXX")
sync_backups() {
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') 开始同步 ====="
  ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 "$SERVER" true || return $?
  # 保留本机历史包；不要用 --delete。
  rsync -a --partial -e 'ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=2' "$SERVER:$REMOTE_DIR/" "$LOCAL_DIR/" || return $?
  ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 "$SERVER" "cd '$REMOTE_DIR' && shasum -a 256 -- *.bin" > "$manifest" || return $?
  [[ -s "$manifest" ]] || return 1
  (cd "$LOCAL_DIR" && shasum -a 256 -c "$manifest") || return $?
  date +%s > "$LOCAL_DIR/last-success.tmp" || return $?
  mv "$LOCAL_DIR/last-success.tmp" "$LOCAL_DIR/last-success" || return $?
  echo "同步及 SHA-256 校验成功。"
}
if sync_backups >> "$LOCAL_DIR/sync.log" 2>&1; then
  echo "备份已同步并校验：$LOCAL_DIR"
else
  code=$?
  echo "$(date '+%Y-%m-%d %H:%M:%S') 同步失败（退出码 $code），保留待补拉状态。" | tee -a "$LOCAL_DIR/sync.log" >&2
  exit "$code"
fi
