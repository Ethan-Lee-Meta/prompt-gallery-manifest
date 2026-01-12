@echo off
setlocal
set "ROOT=%~dp0"

call :find_free_port 3000 3100 WEB_PORT
call :find_free_port 8000 8100 API_PORT

echo Starting prompt-gallery (WSL)...
echo Logs will stream in this window. Press Ctrl+C to stop.
echo Ensuring previous processes are stopped...
wsl bash -lc "cd \"$(wslpath '%ROOT%')\" && ./scripts/stop.sh" >nul 2>nul
wsl bash -lc "cd \"$(wslpath '%ROOT%')\" && API_PORT=%API_PORT% WEB_PORT=%WEB_PORT% ./scripts/dev.sh"
exit /b

:find_free_port
set "START=%~1"
set "END=%~2"
set "OUTVAR=%~3"
set "FOUND="
for /l %%P in (%START%,1,%END%) do (
  netstat -ano | findstr /R /C:":%%P " >nul
  if errorlevel 1 (
    set "FOUND=%%P"
    goto :found_port
  )
)
:found_port
if not defined FOUND (
  echo Failed to find free port in %START%-%END%.
  exit /b 1
)
set "%OUTVAR%=%FOUND%"
exit /b 0
