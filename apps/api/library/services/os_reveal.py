"""
OS Reveal service - opens file/folder in system file manager
"""
import subprocess
import platform
from pathlib import Path


def reveal_folder(path: Path) -> bool:
    """
    Open folder in system file manager (Explorer/Finder/XDG)
    Returns True if successful, False otherwise
    """
    try:
        system = platform.system()
        
        if system == "Windows":
            subprocess.Popen(["explorer", str(path)])
        elif system == "Darwin":  # macOS
            subprocess.Popen(["open", str(path)])
        else:  # Linux/Unix
            subprocess.Popen(["xdg-open", str(path)])
        
        return True
    except Exception as e:
        print(f"Failed to reveal folder: {e}")
        return False
