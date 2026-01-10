#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"

API_LOG="/tmp/prompt-gallery-api.log"
WEB_LOG="/tmp/prompt-gallery-web.log"
API_PID_FILE="/tmp/prompt-gallery-api.pid"
WEB_PID_FILE="/tmp/prompt-gallery-web.pid"
PORTS_FILE="/tmp/prompt-gallery-ports.env"

export DATABASE_URL="${DATABASE_URL:-sqlite:////tmp/prompt-gallery-app.db}"
export STORAGE_ROOT="${STORAGE_ROOT:-/tmp/prompt-gallery-storage}"

mkdir -p "$STORAGE_ROOT"

is_port_in_use() {
  local pattern="(^|[:\\]])$1$"
  local matcher
  if command -v rg >/dev/null 2>&1; then
    matcher="rg -q \"$pattern\""
  else
    matcher="grep -Eq \"$pattern\""
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn | awk 'NR>1 {print $4}' | eval "$matcher"
    return $?
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk 'NR>2 {print $4}' | eval "$matcher"
    return $?
  fi
  return 1
}

find_free_port() {
  local port="$1"
  local max_port="${2:-}"
  while true; do
    if ! is_port_in_use "$port"; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
    if [[ -n "$max_port" && "$port" -gt "$max_port" ]]; then
      return 1
    fi
  done
}

stop_pid_file() {
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

cleanup() {
  stop_pid_file "$API_PID_FILE"
  stop_pid_file "$WEB_PID_FILE"
}

trap cleanup INT TERM

API_PORT="${API_PORT:-}"
WEB_PORT="${WEB_PORT:-}"
if [[ -z "$API_PORT" ]]; then
  API_PORT="$(find_free_port 8000 8100)"
fi
if [[ -z "$WEB_PORT" ]]; then
  WEB_PORT="$(find_free_port 3000 3100)"
fi

if [[ -z "$API_PORT" || -z "$WEB_PORT" ]]; then
  echo "Failed to find free ports in ranges 8000-8100 and 3000-3100."
  exit 1
fi

echo "API_PORT=$API_PORT" > "$PORTS_FILE"
echo "WEB_PORT=$WEB_PORT" >> "$PORTS_FILE"
echo "WEB_URL=http://localhost:$WEB_PORT" >> "$PORTS_FILE"

echo "==> migrate db ($DATABASE_URL)"
(cd "$API_DIR" && PYTHONPATH=. alembic upgrade head)

echo "==> start api (port $API_PORT)"
(cd "$API_DIR" && nohup env DATABASE_URL="$DATABASE_URL" STORAGE_ROOT="$STORAGE_ROOT" \
  python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$API_PORT" \
  > "$API_LOG" 2>&1 & echo $! > "$API_PID_FILE")

echo "==> start web (port $WEB_PORT)"
(cd "$WEB_DIR" && nohup env NEXT_PUBLIC_API_BASE="http://127.0.0.1:$API_PORT" PORT="$WEB_PORT" \
  npm run dev > "$WEB_LOG" 2>&1 & echo $! > "$WEB_PID_FILE")

echo "API: http://127.0.0.1:$API_PORT"
echo "Web: http://localhost:$WEB_PORT"
echo "Logs: $API_LOG $WEB_LOG"

if command -v cmd.exe >/dev/null 2>&1; then
  cmd.exe /c start "" "http://localhost:$WEB_PORT" >/dev/null 2>&1 || true
fi

echo "==> tail logs (Ctrl+C to stop)"
tail -n 200 -f "$API_LOG" "$WEB_LOG"
