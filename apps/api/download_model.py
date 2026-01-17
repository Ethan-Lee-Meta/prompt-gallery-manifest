"""Download Facenet512 model weights for DeepFace"""
import httpx
from pathlib import Path

weights_dir = Path("C:/Users/41513/.deepface/weights")
weights_dir.mkdir(parents=True, exist_ok=True)

weights_file = weights_dir / "facenet512_weights.h5"

if weights_file.exists():
    print(f"[OK] Model already downloaded: {weights_file}")
else:
    print(f"Downloading Facenet512 model weights...")
    url = "https://github.com/serengil/deepface_models/releases/download/v1.0/facenet512_weights.h5"
    
    with httpx.stream("GET", url, follow_redirects=True, timeout=300) as response:
        total = int(response.headers.get("content-length", 0))
        downloaded = 0
        
        with open(weights_file, "wb") as f:
            for chunk in response.iter_bytes(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    percent = (downloaded / total) * 100
                    print(f"\rProgress: {percent:.1f}% ({downloaded}/{total} bytes)", end="")
    
    print(f"\n[OK] Model downloaded successfully!")
