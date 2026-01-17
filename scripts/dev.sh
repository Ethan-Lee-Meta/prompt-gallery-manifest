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

# --- helpers ---------------------------------------------------------------

kill_pid_tree() {
  local pid="$1"
  [[ -z "${pid:-}" ]] && return 0
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  # kill children first
  if command -v pgrep >/dev/null 2>&1; then
    local child
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do
      kill_pid_tree "$child" || true
    done
  fi

  kill "$pid" 2>/dev/null || true
}

stop_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]]; then
      kill_pid_tree "$pid" || true
      sleep 0.2
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

kill_by_port_fast() {
  local port="$1"
  local pids=""

  # Prefer ss (fast). May only show pid info for same user, which is fine here.
  if command -v ss >/dev/null 2>&1; then
    pids="$(ss -lptn "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u | tr '\n' ' ' | xargs || true)"
  fi

  # Fallback: lsof
  if [[ -z "${pids:-}" ]] && command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -t -i ":$port" 2>/dev/null | tr '\n' ' ' | xargs || true)"
  fi

  if [[ -n "${pids:-}" ]]; then
    echo "   Killing processes on port $port: $pids"
    for pid in $pids; do
      kill "$pid" 2>/dev/null || true
    done
    sleep 0.2
    for pid in $pids; do
      kill -9 "$pid" 2>/dev/null || true
    done
  fi
}

find_free_api_port() {
  # API 需要我们自己选端口；优先 8000，如果占用就 +1
  local base=8000
  local max=8100
  for p in $(seq "$base" "$max"); do
    # 用 python bind 检测真实可绑定（能避开“看不到的占用”）
    if python3 - <<PY >/dev/null 2>&1
import socket, sys
s=socket.socket()
try:
  s.bind(("0.0.0.0", $p))
  s.close()
  sys.exit(0)
except OSError:
  sys.exit(1)
PY
    then
      echo "$p"
      return 0
    fi
  done
  return 1
}

wait_for_next_port() {
  # 从 web log 里解析 Next 的 Local 端口
  local max_wait="${1:-60}"
  local waited=0
  local port=""
  while [[ $waited -lt $max_wait ]]; do
    if [[ -f "$WEB_LOG" ]]; then
      port="$(grep -i "Local:" "$WEB_LOG" 2>/dev/null | sed -n 's/.*localhost:\([0-9]\+\).*/\1/p' | tail -1 || true)"
      if [[ -n "${port:-}" ]]; then
        echo "$port"
        return 0
      fi
      # 兼容某些 next 输出格式
      port="$(grep -Eo 'http://localhost:[0-9]+' "$WEB_LOG" 2>/dev/null | tail -1 | sed -n 's/.*:\([0-9]\+\)$/\1/p' || true)"
      if [[ -n "${port:-}" ]]; then
        echo "$port"
        return 0
      fi
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 1
}

wait_http_ready() {
  local url="$1"
  local max_wait="${2:-60}"
  local waited=0
  while [[ $waited -lt $max_wait ]]; do
    # 只要能拿到 HTTP 响应码（非 000）就算 ready
    local code
    code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$url" 2>/dev/null || true)"
    if [[ -n "${code:-}" && "$code" != "000" ]]; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 1
}

stop_all() {
  echo "==> Stopping services..."

  # 1) If we know last ports, kill them quickly
  if [[ -f "$PORTS_FILE" ]]; then
    local old_api_port old_web_port
    old_api_port="$(grep -E '^API_PORT=' "$PORTS_FILE" 2>/dev/null | head -1 | cut -d= -f2 || true)"
    old_web_port="$(grep -E '^WEB_PORT=' "$PORTS_FILE" 2>/dev/null | head -1 | cut -d= -f2 || true)"
    [[ -n "${old_api_port:-}" ]] && kill_by_port_fast "$old_api_port"
    [[ -n "${old_web_port:-}" ]] && kill_by_port_fast "$old_web_port"
  fi

  # 2) Stop via pid files
  stop_pid_file "$API_PID_FILE"
  stop_pid_file "$WEB_PID_FILE"

  # 3) Kill by process patterns (fast, no port scanning)
  pkill -TERM -f "uvicorn .*app.main:app" 2>/dev/null || true
  pkill -TERM -f "next dev" 2>/dev/null || true
  pkill -TERM -f "node.*next" 2>/dev/null || true
  pkill -TERM -f "turbopack" 2>/dev/null || true

  sleep 0.3

  pkill -9 -f "uvicorn .*app.main:app" 2>/dev/null || true
  pkill -9 -f "next dev" 2>/dev/null || true
  pkill -9 -f "node.*next" 2>/dev/null || true
  pkill -9 -f "turbopack" 2>/dev/null || true

  # 4) Small targeted port cleanup for common defaults (avoid long scans)
  kill_by_port_fast 8000
  kill_by_port_fast 3000

  rm -f "$WEB_DIR/.next/dev/lock" 2>/dev/null || true
  rm -f "$PORTS_FILE" 2>/dev/null || true

  sleep 0.8
}

cleanup() {
  stop_all
}
trap cleanup INT TERM EXIT

# --- main ------------------------------------------------------------------

echo "==> Stopping any existing services..."
stop_all

API_PORT="$(find_free_api_port || true)"
if [[ -z "${API_PORT:-}" ]]; then
  echo "Failed to find free API port in 8000-8100."
  exit 1
fi

echo "==> migrate db ($DATABASE_URL)"
(cd "$API_DIR" && PYTHONPATH=. alembic upgrade head)

echo "==> start api (port $API_PORT)"
: > "$API_LOG"
(cd "$API_DIR" && nohup env DATABASE_URL="$DATABASE_URL" STORAGE_ROOT="$STORAGE_ROOT" \
  python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$API_PORT" \
  > "$API_LOG" 2>&1 & echo $! > "$API_PID_FILE")

echo "==> start web (Next will pick an available port)"
: > "$WEB_LOG"
(cd "$WEB_DIR" && nohup env NEXT_PUBLIC_API_BASE="http://127.0.0.1:$API_PORT" \
  npm run dev > "$WEB_LOG" 2>&1 & echo $! > "$WEB_PID_FILE")

echo "API: http://127.0.0.1:$API_PORT"
echo "Logs: $API_LOG $WEB_LOG"
echo "   Waiting for Next.js to report the actual port..."

WEB_PORT="$(wait_for_next_port 60 || true)"
if [[ -z "${WEB_PORT:-}" ]]; then
  echo "   Next.js did not report a port in time. Check: $WEB_LOG"
  exit 1
fi

WEB_URL="http://localhost:$WEB_PORT"

{
  echo "API_PORT=$API_PORT"
  echo "WEB_PORT=$WEB_PORT"
  echo "WEB_URL=$WEB_URL"
} > "$PORTS_FILE"

echo "Web (actual): $WEB_URL"

echo "   Waiting for Web to become ready..."
wait_http_ready "$WEB_URL" 60 || true

echo "   Opening browser: $WEB_URL"
if command -v cmd.exe >/dev/null 2>&1; then
  cmd.exe /c start "" "$WEB_URL" 2>&1 || true
elif command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -Command "Start-Process '$WEB_URL'" 2>&1 || true
elif command -v explorer.exe >/dev/null 2>&1; then
  explorer.exe "$WEB_URL" 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$WEB_URL" >/dev/null 2>&1 || true
else
  echo "   Could not auto-open browser. Please open: $WEB_URL"
fi

echo "==> tail logs (Ctrl+C to stop)"
tail -n 200 -f "$API_LOG" "$WEB_LOG"
