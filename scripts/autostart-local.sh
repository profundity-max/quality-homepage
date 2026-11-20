#!/usr/bin/env bash
# 登录自启：确保 Colima 运行后拉起品集 Compose 栈。
# 由 ~/Library/LaunchAgents/com.qnexus.autostart.plist 在用户登录时调用。
#
# 背景：2026-11-19 关机时 Colima 的虚拟机未能正常停止，残留的 vz.pid 指向了被
# 系统复用的无关进程，导致 Colima 误判为"正在运行"而拒绝启动（Broken）。
# 这里在启动前做一次安全的自愈：只有当 vz.pid 指向的进程已经不存在、或明显不是
# 虚拟机进程时才把它移走留档；绝不删除虚拟机磁盘和 Docker 卷。
set -uo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
LOG_DIR="$REPO_ROOT/logs"
LOG="$LOG_DIR/autostart.log"
mkdir -p "$LOG_DIR"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"
}

fix_stale_vz_pid() {
  local pid_file="$HOME/.colima/_lima/colima/vz.pid"
  [ -f "$pid_file" ] || return 0

  local pid command
  pid=$(cat "$pid_file" 2>/dev/null || true)
  if [ -z "$pid" ]; then
    mv "$pid_file" "$pid_file.stale-$(date +%Y%m%d-%H%M%S)"
    log "已移走空的 vz.pid"
    return 0
  fi

  command=$(ps -p "$pid" -o command= 2>/dev/null || true)
  if [ -z "$command" ] || ! printf '%s' "$command" | grep -qiE 'colima|virtualization|/vz'; then
    mv "$pid_file" "$pid_file.stale-$(date +%Y%m%d-%H%M%S)"
    log "已移走陈旧 vz.pid（pid=$pid，对应进程=${command:-不存在}）"
  fi
}

log "=== autostart begin ==="

# 登录初期文件系统/虚拟化子系统可能尚未就绪
sleep 5

if ! colima status >/dev/null 2>&1; then
  fix_stale_vz_pid
  log "启动 Colima"
  if ! colima start >>"$LOG" 2>&1; then
    log "Colima 首次启动失败，自愈后重试一次"
    fix_stale_vz_pid
    if ! colima start >>"$LOG" 2>&1; then
      log "Colima 启动失败，放弃本次自启"
      exit 1
    fi
  fi
fi

# 等待 Docker socket 就绪（最多 180 秒）
ready=0
for _ in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done
if [ "$ready" -ne 1 ]; then
  log "Docker 守护进程未就绪，放弃本次自启"
  exit 1
fi

log "拉起 Compose 栈"
if docker compose --project-directory "$REPO_ROOT" up -d --wait >>"$LOG" 2>&1; then
  log "Compose 栈已就绪"
else
  log "Compose 启动失败"
  exit 1
fi

log "=== autostart done ==="
