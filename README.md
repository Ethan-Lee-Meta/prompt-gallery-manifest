# Prompt Gallery Manifest

Local workspace for the prompt-gallery app (API + Web). The default launcher uses WSL and starts both services with auto-selected ports.

## Requirements
- Windows with WSL enabled
- Python 3 in WSL
- Node.js in WSL (or available via Windows path in WSL)

## Environment setup (WSL)
Install dependencies in WSL (example for Ubuntu):
```
sudo apt-get update -y
sudo apt-get install -y python3 python3-venv python3-pip nodejs npm
```

If you prefer Node.js via nvm in WSL:
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
```

Optional environment variables:
- `DATABASE_URL` (default: `sqlite:////tmp/prompt-gallery-app.db`)
- `STORAGE_ROOT` (default: `/tmp/prompt-gallery-storage`)
- `API_PORT` (default: auto-pick 8000-8100)
- `WEB_PORT` (default: auto-pick 3000-3100)

## Quick start (Windows)
- `run.bat` to start
- `stop.bat` to stop (or press Ctrl+C in the run window)

The launcher:
- picks free ports (API: 8000-8100, Web: 3000-3100)
- sets `NEXT_PUBLIC_API_BASE` so the Web app points to the API
- opens the browser automatically
- tails logs in the same terminal

## Logs
- `/tmp/prompt-gallery-api.log`
- `/tmp/prompt-gallery-web.log`

## Notes
- The API uses `/tmp/prompt-gallery-app.db` and `/tmp/prompt-gallery-storage` by default.
- If ports are occupied, it will choose the next available port in the range.
