#!/usr/bin/env bash
#
# 把本机代码同步到部署机（部门 Mac Studio）并重建容器。
#
# 为什么需要这个脚本：开发机到 github.com 的链路不稳定（间歇性 75 秒 TCP 超时），
# 而开发机与部署机在同一个局域网内。本脚本走 SSH 直推，把「测试 → 备份 → 同步 →
# 部署 → 健康检查」串成一条命令，避免漏步骤。
#
# 用法：
#   scripts/deploy-to-server.sh [选项]
#
# 选项：
#   --dry-run        只打印将要执行的命令，不产生任何变更
#   --skip-checks    跳过本机的 lint / typecheck / test:local
#   --skip-backup    跳过部署前的服务器备份（不推荐：OPS-10 要求升级前先备份）
#   --help           显示本帮助
#
# 环境变量（都有默认值，本机已配好 SSH 别名时无需设置任何变量）：
#   Q_NEXUS_DEPLOY_REMOTE   git 远端名            默认 qserver
#   Q_NEXUS_DEPLOY_HOST     SSH 主机别名          默认 quality-server
#   Q_NEXUS_DEPLOY_DIR      部署机上的仓库路径     默认 /Users/quality/q-nexus
#   Q_NEXUS_DEPLOY_TIMEOUT  健康检查等待秒数       默认 180
#
# 退出码：0 成功；非 0 表示在对应步骤失败，部署机保持原状或需要人工回退。

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

REMOTE="${Q_NEXUS_DEPLOY_REMOTE:-qserver}"
HOST="${Q_NEXUS_DEPLOY_HOST:-quality-server}"
DEPLOY_DIR="${Q_NEXUS_DEPLOY_DIR:-/Users/quality/q-nexus}"
TIMEOUT="${Q_NEXUS_DEPLOY_TIMEOUT:-180}"

DRY_RUN=0
RUN_CHECKS=1
RUN_BACKUP=1

# ── 输出 ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1); BLUE=$(tput setaf 4)
else
  BOLD=""; DIM=""; RESET=""; GREEN=""; YELLOW=""; RED=""; BLUE=""
fi

step()  { printf '\n%s▶ %s%s\n' "$BOLD$BLUE" "$1" "$RESET"; }
ok()    { printf '%s  ✓ %s%s\n' "$GREEN" "$1" "$RESET"; }
skip()  { printf '%s  – %s%s\n' "$DIM" "$1" "$RESET"; }
fail()  { printf '%s  ✗ %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# 在 dry-run 下只打印，不执行
run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '%s  [dry-run] %s%s\n' "$DIM" "$*" "$RESET"
  else
    "$@"
  fi
}

usage() { sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)     DRY_RUN=1 ;;
    --skip-checks) RUN_CHECKS=0 ;;
    --skip-backup) RUN_BACKUP=0 ;;
    --help|-h)     usage; exit 0 ;;
    *)             fail "未知选项：$1（用 --help 查看用法）" ;;
  esac
  shift
done

[[ $DRY_RUN -eq 1 ]] && printf '%s（dry-run：只打印，不产生变更）%s\n' "$YELLOW" "$RESET"

# ── 1. 前置检查 ─────────────────────────────────────────────────────────────
step "前置检查"

git rev-parse --git-dir >/dev/null 2>&1 || fail "当前目录不是 git 仓库"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
VERSION=$(cat VERSION 2>/dev/null || echo '?')
ok "分支 ${BRANCH}，本机版本 ${VERSION}"

# 工作区必须干净：git push 只推已提交内容，脏工作区会让部署机拿到与预期不同的代码
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short | sed 's/^/    /'
  fail "工作区有未提交的改动，请先提交（部署机只会拿到已提交的代码）"
fi
ok "工作区干净"

git remote get-url "$REMOTE" >/dev/null 2>&1 || fail "git 远端 $REMOTE 不存在"
ok "远端 $REMOTE → $(git remote get-url "$REMOTE")"

if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" true 2>/dev/null; then
  fail "无法免密连接 ${HOST}（检查 SSH 别名与是否在同一局域网）"
fi
ok "SSH 免密连接 $HOST 正常"

PREVIOUS_VERSION=$(ssh -o BatchMode=yes "$HOST" "cd '$DEPLOY_DIR' 2>/dev/null && cat VERSION" 2>/dev/null || echo '?')
ok "部署机当前版本 $PREVIOUS_VERSION"

# ── 2. 本机验证 ─────────────────────────────────────────────────────────────
step "本机验证"
if [[ $RUN_CHECKS -eq 1 ]]; then
  run npm run lint
  run npm run typecheck
  run npm run test:local
  ok "lint / typecheck / 本地测试通过"
else
  skip "已按 --skip-checks 跳过"
fi

# ── 3. 部署前备份（OPS-10）──────────────────────────────────────────────────
step "部署前备份"
if [[ $RUN_BACKUP -eq 1 ]]; then
  run ssh -o BatchMode=yes "$HOST" "cd '$DEPLOY_DIR' && bash scripts/run-backup-launchd.sh manual"
  ok "已触发服务器端加密备份（写入 .data/backups 与审计）"
else
  skip "已按 --skip-backup 跳过（OPS-10 要求升级前先备份）"
fi

# ── 4. 同步代码 ─────────────────────────────────────────────────────────────
step "同步代码到部署机"
run git push "$REMOTE" "$BRANCH"
ok "已推送 ${BRANCH} → ${REMOTE}"

# 推送后核对部署机确实停在同一个提交上，避免推送成功但落到了别的引用
if [[ $DRY_RUN -eq 0 ]]; then
  LOCAL_HEAD=$(git rev-parse HEAD)
  REMOTE_HEAD=$(ssh -o BatchMode=yes "$HOST" "cd '$DEPLOY_DIR' && git rev-parse HEAD")
  [[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]] \
    || fail "部署机提交与本机不一致（本机 ${LOCAL_HEAD:0:7}，部署机 ${REMOTE_HEAD:0:7}）"
  ok "部署机已停在同一提交 ${LOCAL_HEAD:0:7}"
fi

# ── 5. 重建容器 ─────────────────────────────────────────────────────────────
step "重建并启动容器"
run ssh -o BatchMode=yes "$HOST" "cd '$DEPLOY_DIR' && docker compose --profile operations build backup bootstrap"
run ssh -o BatchMode=yes "$HOST" "cd '$DEPLOY_DIR' && docker compose up --build -d --wait"
ok "容器已启动"

# ── 6. 健康检查 ─────────────────────────────────────────────────────────────
step "健康检查"
if [[ $DRY_RUN -eq 1 ]]; then
  printf '%s  [dry-run] 轮询 http://127.0.0.1:8080/api/health/ready（最多 %s 秒）%s\n' "$DIM" "$TIMEOUT" "$RESET"
else
  deadline=$(( $(date +%s) + TIMEOUT ))
  while :; do
    status=$(ssh -o BatchMode=yes "$HOST" \
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/health/ready" 2>/dev/null || echo 000)
    [[ "$status" == "200" ]] && break
    if (( $(date +%s) >= deadline )); then
      printf '\n'
      fail "健康检查超时（最后一次 HTTP ${status}）。回退方式见下方提示。"
    fi
    printf '%s  … 等待中（当前 HTTP %s）%s\n' "$DIM" "$status" "$RESET"
    sleep 5
  done
  ok "健康检查通过（ready = 200）"
fi

# ── 结果 ────────────────────────────────────────────────────────────────────
step "完成"
if [[ $DRY_RUN -eq 1 ]]; then
  printf '  dry-run 结束，未产生任何变更。\n'
  exit 0
fi

printf '  版本：%s → %s\n' "$PREVIOUS_VERSION" "$VERSION"
ssh -o BatchMode=yes "$HOST" "cd '$DEPLOY_DIR' && docker compose ps --format '  {{.Service}}: {{.Status}}'"
printf '\n  门户：http://quality-server.local:8080\n'
if [[ "$PREVIOUS_VERSION" != "$VERSION" ]]; then
  # 部署机的 main 是已检出分支（receive.denyCurrentBranch=updateInstead），
  # 非快进推送会被拒绝，所以回退要在部署机本地做。
  printf '%s  回退上一版：ssh %s "cd %s && git reset --hard HEAD~1 && docker compose up --build -d --wait"%s\n' \
    "$DIM" "$HOST" "$DEPLOY_DIR" "$RESET"
fi
