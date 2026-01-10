@echo off
setlocal
set "ROOT=%~dp0"

echo Starting prompt-gallery (WSL)...
echo Logs will stream in this window. Press Ctrl+C to stop.
wsl bash -lc "cd \"$(wslpath '%ROOT%')\" && ./scripts/dev.sh"
