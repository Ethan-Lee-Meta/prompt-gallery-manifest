@echo off
setlocal
set "ROOT=%~dp0"

echo Stopping prompt-gallery (WSL)...
wsl bash -lc "cd \"$(wslpath '%ROOT%')\" && ./scripts/stop.sh"
