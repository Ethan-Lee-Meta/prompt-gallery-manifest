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

## Data Storage

### Default Data Location

All data (database + media files) is stored persistently in:

- **Windows**: `C:\Users\<Your-Username>\AppData\Local\prompt-gallery-data\`
- **Linux/Mac**: `~/.local/share/prompt-gallery/`

This ensures your data persists even if you delete or re-clone the project from Git.

### Data Structure

```
prompt-gallery-data/
├── prompt-gallery-app.db          # SQLite database (items, categories, series, etc.)
└── prompt-gallery-storage/
    ├── media/                      # Original media files
    ├── thumb/                      # Thumbnails
    └── library/                    # Library files
```

### Customize Data Location

To use a custom location, create a `.env` file in the project root:

```bash
DATABASE_URL=sqlite:///D:/my-data/prompt-gallery-app.db
STORAGE_ROOT=D:/my-data/prompt-gallery-storage
```

See `.env.example` for all available options.

### Migrating Existing Data

If you have existing data in the project's `.data/` folder:

```bash
python scripts/migrate-data.py
```

This will safely copy your data to the new persistent location.

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
- Data is stored persistently in your user directory (see Data Storage section above).
- If ports are occupied, it will choose the next available port in the range.

