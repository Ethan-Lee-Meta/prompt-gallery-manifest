from __future__ import annotations

import numpy as np


def pack_f32(vec: np.ndarray) -> tuple[bytes, int]:
    v = np.asarray(vec, dtype=np.float32).reshape(-1)
    return v.tobytes(), int(v.shape[0])


def unpack_f32(blob: bytes, dim: int) -> np.ndarray:
    v = np.frombuffer(blob, dtype=np.float32)
    if dim and v.shape[0] != dim:
        raise ValueError(f"embedding dim mismatch: got={v.shape[0]} expected={dim}")
    return v


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float32).reshape(-1)
    b = np.asarray(b, dtype=np.float32).reshape(-1)
    na = float(np.linalg.norm(a) + 1e-9)
    nb = float(np.linalg.norm(b) + 1e-9)
    return float(np.dot(a, b) / (na * nb))
