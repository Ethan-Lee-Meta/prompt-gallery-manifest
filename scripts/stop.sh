#!/usr/bin/env bash
set -euo pipefail

API_PID_FILE="/tmp/prompt-gallery-api.pid"
WEB_PID_FILE="/tmp/prompt-gallery-web.pid"

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

echo "Stopped. If anything remains, check: ps -ef | rg 'uvicorn|next dev'"
