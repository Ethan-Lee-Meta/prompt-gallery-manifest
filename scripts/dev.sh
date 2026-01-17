#!/usr/bin/env bash
set -Eeuo pipefail

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

on_err() {
  local ec=$?
  echo "[ERROR] dev.sh failed (exit=$ec)" >&2
  echo "  at line: ${BASH_LINENO[0]}  cmd: ${BASH_COMMAND}" >&2
  if [[ -f "$WEB_LOG" ]]; then
    echo "---- $WEB_LOG (last 120) ----" >&2
    tail -n 120 "$WEB_LOG" >&2 || true
  fi
  if [[ -f "$API_LOG" ]]; then
    echo "---- $API_LOG (last 80) ----" >&2
    tail -n 80 "$API_LOG" >&2 || true
  fi
  exit $ec
}
trap on_err ERR

kill_pid_tree() {
  local pid="$1"
  [[ -z "${pid:-}" ]] && return 0
  kill "$pid" 2>/dev/null || true
  if command -v pgrep >/dev/null 2>&1; then
    local c
    for c in $(pgrep -P "$pid" 2>/dev/null || true); do
      kill_pid_tree "$c" || true
    done
  fi
  kill -9 "$pid" 2>/dev/null || true
}

stop_pid_file() {
  local f="$1"
  if [[ -f "$f" ]]; then
    local pid
    pid="$(cat "$f" 2>/dev/null || true)"
    [[ -n "${pid:-}" ]] && kill_pid_tree "$pid" || true
    rm -f "$f"
  fi
}

kill_by_port_fast() {
  local port="$1"
  local pids=""

  if command -v ss >/dev/null 2>&1; then
    pids="$(ss -lptn "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u | xargs echo -n || true)"
  fi
  if [[ -z "${pids:-}" ]] && command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -t -i ":$port" 2>/dev/null | xargs echo -n || true)"
  fi

  if [[ -n "${pids:-}" ]]; then
    echo "   Killing processes on port $port: $pids"
    for pid in $pids; do kill "$pid" 2>/dev/null || true; done
    sleep 0.2
    for pid in $pids; do kill -9 "$pid" 2>/dev/null || true; done
  fi
}

stop_all() {
  echo "==> Stopping services..."

  if [[ -f "$PORTS_FILE" ]]; then
    local old_api_port old_web_port
    old_api_port="$(grep -E '^API_PORT=' "$PORTS_FILE" 2>/dev/null | head -1 | cut -d= -f2 || true)"
    old_web_port="$(grep -E '^WEB_PORT=' "$PORTS_FILE" 2>/dev/null | head -1 | cut -d= -f2 || true)"
    [[ -n "${old_api_port:-}" ]] && kill_by_port_fast "$old_api_port"
    [[ -n "${old_web_port:-}" ]] && kill_by_port_fast "$old_web_port"
  fi

  stop_pid_file "$API_PID_FILE"
  stop_pid_file "$WEB_PID_FILE"

  pkill -TERM -f "uvicorn .*app.main:app" 2>/dev/null || true
  pkill -TERM -f "next dev" 2>/dev/null || true
  pkill -TERM -f "node.*next" 2>/dev/null || true
  pkill -TERM -f "turbopack" 2>/dev/null || true
  sleep 0.2
  pkill -9 -f "uvicorn .*app.main:app" 2>/dev/null || true
  pkill -9 -f "next dev" 2>/dev/null || true
  pkill -9 -f "node.*next" 2>/dev/null || true
  pkill -9 -f "turbopack" 2>/dev/null || true

  # 兜底只清理 API 默认端口，避免误伤你系统里其他 3000 服务
  kill_by_port_fast 8000

  rm -f "$WEB_DIR/.next/dev/lock" 2>/dev/null || true
  rm -f "$PORTS_FILE" 2>/dev/null || true
  sleep 0.2
}

cleanup() { stop_all; }
trap cleanup INT TERM EXIT

find_free_port_localhost_v4() {
  local base="$1" max="$2"
  python3 - <<PY
import socket
base=int("$base"); maxp=int("$max")
for p in range(base, maxp+1):
    s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", p))
        s.close()
        print(p)
        raise SystemExit(0)
    except OSError:
        try: s.close()
        except: pass
raise SystemExit(1)
PY
}

# ---------------- main ----------------

echo "==> Stopping any existing services..."
stop_all

command -v node >/dev/null 2>&1 || { echo "[FATAL] node not found in WSL PATH" >&2; exit 127; }

API_PORT="$(find_free_port_localhost_v4 8000 8100)"
echo "==> migrate db ($DATABASE_URL)"
(cd "$API_DIR" && PYTHONPATH=. alembic upgrade head)

echo "==> start api (port $API_PORT)"
: > "$API_LOG"
(cd "$API_DIR" && nohup env DATABASE_URL="$DATABASE_URL" STORAGE_ROOT="$STORAGE_ROOT" \
  python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$API_PORT" \
  > "$API_LOG" 2>&1 & echo $! > "$API_PID_FILE")

# 给 API 一点启动时间
sleep 0.5
api_pid="$(cat "$API_PID_FILE" 2>/dev/null || true)"
if [[ -z "$api_pid" ]] || ! kill -0 "$api_pid" 2>/dev/null; then
  echo "[ERROR] API failed to start. Check $API_LOG" >&2
  exit 1
fi

WEB_PORT="$(find_free_port_localhost_v4 3000 3999)"
echo "==> start web (port $WEB_PORT)"
: > "$WEB_LOG"

next_bin="$WEB_DIR/node_modules/.bin/next"
if [[ -x "$next_bin" ]]; then
  (cd "$WEB_DIR" && nohup env NEXT_PUBLIC_API_BASE="http://127.0.0.1:$API_PORT" \
    "$next_bin" dev --hostname 127.0.0.1 --port "$WEB_PORT" \
    > "$WEB_LOG" 2>&1 & echo $! > "$WEB_PID_FILE")
else
  (cd "$WEB_DIR" && nohup env NEXT_PUBLIC_API_BASE="http://127.0.0.1:$API_PORT" \
    npm run dev -- --hostname 127.0.0.1 --port "$WEB_PORT" \
    > "$WEB_LOG" 2>&1 & echo $! > "$WEB_PID_FILE")
fi

# 给 Web 一点启动时间
sleep 0.5
web_pid="$(cat "$WEB_PID_FILE" 2>/dev/null || true)"
if [[ -z "$web_pid" ]] || ! kill -0 "$web_pid" 2>/dev/null; then
  echo "[ERROR] Web failed to start. Check $WEB_LOG" >&2
  exit 1
fi

echo "API: http://127.0.0.1:$API_PORT"
echo "Logs: $API_LOG $WEB_LOG"
WEB_URL="http://127.0.0.1:$WEB_PORT"
echo "Web: $WEB_URL"

{
  echo "API_PORT=$API_PORT"
  echo "WEB_PORT=$WEB_PORT"
  echo "WEB_URL=$WEB_URL"
} > "$PORTS_FILE"

echo "   Opening browser: $WEB_URL"
if command -v cmd.exe >/dev/null 2>&1; then
  cmd.exe /c start "" "$WEB_URL" 2>&1 || true
elif command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -Command "Start-Process '$WEB_URL'" 2>&1 || true
elif command -v explorer.exe >/dev/null 2>&1; then
  explorer.exe "$WEB_URL" 2>&1 || true
fi

echo "==> tail logs (Ctrl+C to stop)"
tail -n 200 -f "$API_LOG" "$WEB_LOG"