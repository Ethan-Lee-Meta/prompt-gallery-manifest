@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

echo Starting prompt-gallery (WSL)...
echo Logs will stream in this window. Press Ctrl+C to stop.
wsl.exe bash -lc "cd \"$(wslpath -u '%ROOT%')\" && ./scripts/dev.sh"
if errorlevel 1 (
    echo.
    echo Script failed!
    pause
)
exit /b
