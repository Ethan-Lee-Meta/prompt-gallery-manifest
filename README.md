# Prompt Gallery Manifest

Local workspace for the prompt-gallery app (API + Web). The default launcher uses WSL and starts both services with auto-selected ports.

## Requirements
- Windows with WSL enabled
- Python 3 in WSL
- Node.js in WSL (or available via Windows path in WSL)

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
