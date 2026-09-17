#!/usr/bin/env bash
#
# 把「品质部门户」的局域网地址固定到有线以太网（en0）上，避免 DHCP 换 IP 导致访问失效。
#
# Everything above the "STAGES" marker is the wizard library: do not hand-edit
# it. Author the per-step stages below the marker.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library: delightful, consistent UX, identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()    # KEYs written to ENV_FILE this run
WRITTEN_SECRET=() # secret NAMEs set this run
SKIPPED=()        # things we couldn't do (e.g. gh missing)

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

# banner "Title" shows the opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later, since it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
# Clearing keeps only the current step on screen.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." prints a plain instruction line.
say()  { printf '  %s\n' "$1"; }
# step "..." is a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser; visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# pause "msg" waits for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" is a y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY: current value of KEY in ENV_FILE, if any.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

# ask KEY "Prompt" reads a value into $KEY. Offers the existing .env value as
# a default on re-runs (Enter keeps it). Visible input (non-secret).
ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# ask_secret KEY "Prompt" is like ask, but input is hidden.
ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# write_env KEY VALUE upserts KEY=VALUE into ENV_FILE (creates it; replaces
# any existing line). Idempotent.
write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

# set_secret NAME VALUE sets a GitHub Actions repo secret via gh. Falls back
# to a warning (and records it) if gh is unavailable or unauthenticated.
set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name: gh not ready; set it later"
}

# set_var NAME VALUE sets a GitHub Actions repo variable (non-secret).
set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name, gh not ready; set it later"
}

# finish clears, then shows a closing summary of everything configured.
finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES: author this section. One stage() per step the human takes.
# Replace the example below. Set TOTAL_STAGES to match the stages you write.
# ──────────────────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────────────────
# STAGES — 每个 stage() 对应一个需要人工确认的步骤。
# ──────────────────────────────────────────────────────────────────────────

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"
ENV_FILE="$REPO_ROOT/.env"

WIRED_IP="192.168.60.152"
WIRED_MASK="255.255.252.0"
WIRED_ROUTER="192.168.60.1"
WIRED_SERVICE="Ethernet"

TOTAL_STAGES=4

banner "品集｜Q Nexus — 固定有线局域网地址"

# ── Stage 1 · 确认现状与目标 ─────────────────────────────────────────────
stage "确认有线网卡现状与目标地址"
say "当前有线服务配置（$WIRED_SERVICE / en0）："
networksetup -getinfo "$WIRED_SERVICE" 2>/dev/null | sed 's/^/    /' || warn "未找到网络服务 $WIRED_SERVICE"
say ""
say "目标：改为静态地址，让门户始终通过有线以太网访问："
note "  IP       = $WIRED_IP"
note "  子网掩码 = ${WIRED_MASK}（当前网段 192.168.60.0/22）"
note "  路由器   = $WIRED_ROUTER"
say "WiFi 不受影响，仍用于连接外网和开发。"
if ping -c 1 -W 1000 "$WIRED_IP" >/dev/null 2>&1; then
  warn "$WIRED_IP 已有设备响应，请改用其他空闲地址后再执行。"
  ask WIRED_IP "改为使用哪个固定地址:"
fi
pause "确认无误后按 Enter 继续"

# ── Stage 2 · 设置静态地址（需要管理员密码） ─────────────────────────────
stage "设置静态地址（需要 macOS 管理员密码）"
say "即将执行（会提示输入管理员密码）："
note "  sudo networksetup -setmanual \"$WIRED_SERVICE\" $WIRED_IP $WIRED_MASK $WIRED_ROUTER"
if confirm "确认修改有线网卡为静态地址？"; then
  sudo networksetup -setmanual "$WIRED_SERVICE" "$WIRED_IP" "$WIRED_MASK" "$WIRED_ROUTER"
  say "已提交修改，等待网络生效…"
  sleep 6
else
  warn "已跳过修改；可稍后重新运行本向导。"
  finish
  exit 0
fi

# ── Stage 3 · 验证 ──────────────────────────────────────────────────────
stage "验证新地址与服务可达性"
current_ip=$(ipconfig getifaddr en0 2>/dev/null || true)
note "  en0 当前 IP = ${current_ip:-未获取到}"
if [[ "$current_ip" == "$WIRED_IP" ]]; then
  say "静态地址已生效。"
else
  warn "en0 仍是 ${current_ip}，可能需要在系统设置中确认或稍后重试。"
fi
say "检查门户健康端点与登录页："
curl -fsS "http://${WIRED_IP}:8080/api/health/live" >/dev/null 2>&1 && say "  live  OK" || warn "  live 失败（服务是否在运行？）"
curl -fsS "http://${WIRED_IP}:8080/api/health/ready" >/dev/null 2>&1 && say "  ready OK" || warn "  ready 失败"
curl -fsS -o /dev/null "http://${WIRED_IP}:8080/login" && say "  login OK" || warn "  login 失败"
say ""
say "如需回滚为 DHCP：sudo networksetup -setdhcp \"$WIRED_SERVICE\""
pause "确认新地址可访问后继续"

# ── Stage 4 · 记录到 .env ───────────────────────────────────────────────
stage "把固定地址记入 .env"
write_env QNEXUS_LAN_IP "$WIRED_IP"
say "局域网访问地址：http://${WIRED_IP}:8080"
say "（服务本身监听所有网卡，因此有线网段内的同事都能访问）"

finish
