#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PID_FILE="/tmp/prompt-gallery-api.pid"
WEB_PID_FILE="/tmp/prompt-gallery-web.pid"
PORTS_FILE="/tmp/prompt-gallery-ports.env"
WEB_LOCK_FILE="$ROOT_DIR/apps/web/.next/dev/lock"
DEFAULT_API_PORT="8000"
DEFAULT_WEB_PORT="3000"

kill_pattern() {
  local pattern="$1"
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f "$pattern" | xargs -r kill 2>/dev/null || true
  elif command -v pkill >/dev/null 2>&1; then
    pkill -f "$pattern" 2>/dev/null || true
  fi
}

kill_port() {
  local port="$1"
  local pids=""
  if command -v ss >/dev/null 2>&1; then
    pids="$(ss -lptn "sport = :$port" 2>/dev/null | awk -F'pid=' 'NR>1 {print $2}' | awk -F',' '{print $1}' | sort -u)"
  fi
  if [[ -z "$pids" ]] && command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u)"
  fi
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      kill "$pid" 2>/dev/null || true
    done
  fi
}

stop_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" || true)"
    if [[ -n "${pid:-}" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

stop_pid "$API_PID_FILE"
stop_pid "$WEB_PID_FILE"
kill_pattern "uvicorn app.main:app"
kill_pattern "next dev"
kill_pattern "/mnt/c/nvm4w/nodejs/npm run dev"
kill_pattern "node.exe.*next"
API_PORT="$DEFAULT_API_PORT"
WEB_PORT="$DEFAULT_WEB_PORT"
if [[ -f "$PORTS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$PORTS_FILE"
fi
kill_port "${API_PORT:-$DEFAULT_API_PORT}"
kill_port "${WEB_PORT:-$DEFAULT_WEB_PORT}"
rm -f "$WEB_LOCK_FILE"

echo "Stopped. If anything remains, check: ps -ef | rg 'uvicorn|next dev'"
