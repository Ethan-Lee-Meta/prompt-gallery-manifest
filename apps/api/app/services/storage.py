from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple
import hashlib

from fastapi import UploadFile

DEFAULT_MAX_BYTES = 200 * 1024 * 1024  # 200MB


async def save_uploadfile_streaming(
    upload: UploadFile,
    dst: Path,
    max_bytes: int = DEFAULT_MAX_BYTES,
    chunk_size: int = 1024 * 1024,
    compute_sha256: bool = True,
) -> Tuple[int, Optional[str]]:
    """
    Stream UploadFile to disk safely with a size limit.
    Returns (total_bytes_written, sha256_hex_or_None).
    """
    dst.parent.mkdir(parents=True, exist_ok=True)

    h = hashlib.sha256() if compute_sha256 else None
    total = 0
    with dst.open("wb") as f:
        while True:
            chunk = await upload.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                try:
                    f.close()
                finally:
                    safe_unlink(dst)
                raise ValueError(f"file too large (>{max_bytes} bytes)")
            if h:
                h.update(chunk)
            f.write(chunk)

    return total, (h.hexdigest() if h else None)


def safe_unlink(p: Optional[Path]) -> None:
    if not p:
        return
    try:
        if p.exists():
            p.unlink()
    except Exception:
        pass


def safe_rmdir_empty(p: Optional[Path]) -> None:
    if not p:
        return
    try:
        if p.exists() and p.is_dir():
            p.rmdir()
    except Exception:
        pass
