from __future__ import annotations

from pathlib import Path
import subprocess

from PIL import Image


def make_image_thumb(src: Path, dst: Path, max_w: int = 768, quality: int = 85) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = im.convert("RGB")
        w, h = im.size
        if w > max_w:
            nh = int(h * (max_w / w))
            im = im.resize((max_w, nh))
        im.save(dst, format="JPEG", quality=quality, optimize=True)


def make_video_poster(src: Path, poster_dst: Path, ss: float = 0.5) -> None:
    poster_dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(ss),
        "-i", str(src),
        "-frames:v", "1",
        "-q:v", "2",
        str(poster_dst),
    ]
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if p.returncode != 0:
            print(f"WARNING: ffmpeg failed to generate poster: {p.stderr[:500]}")
            # Do not raise error, just skip poster generation
            return
    except FileNotFoundError:
        print("WARNING: ffmpeg not found in PATH. Video poster generation skipped.")
        return
