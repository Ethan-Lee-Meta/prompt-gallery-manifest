from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List, Tuple

import numpy as np
from sqlmodel import Session, select

from app.models import Category, CategoryEmbedding, ItemEmbedding
from app.services.embeddings import pack_f32, unpack_f32, cosine


MODEL_KEY_DEFAULT = "open_clip_ViT-B-32"  # stable key for DB rows


@dataclass(frozen=True)
class ClassifyResult:
    auto_category_id: str
    confidence: Optional[float]
    item_vec: Optional[np.ndarray]  # None if classifier disabled


def _fallback_category_id(session: Session) -> str:
    # Prefer "创意" if exists & active, else first active category by sort_order
    c = session.exec(
        select(Category).where(Category.is_active == True, Category.name == "创意")
    ).first()
    if c:
        return c.id
    c2 = session.exec(
        select(Category).where(Category.is_active == True).order_by(Category.sort_order.asc())
    ).first()
    if not c2:
        raise RuntimeError("No active categories found; seed categories first.")
    return c2.id


def _open_clip_available() -> bool:
    try:
        import torch  # noqa
        import open_clip  # noqa
        return True
    except Exception:
        return False


# Lazy singleton cache to avoid reloading model for each request
_CLIP = {"ready": False, "model": None, "preprocess": None, "tokenizer": None, "device": None}


def _ensure_clip_loaded():
    if _CLIP["ready"]:
        return
    import torch
    import open_clip

    device = "cpu"
    model_name = "ViT-B-32"
    pretrained = "laion2b_s34b_b79k"

    model, _, preprocess = open_clip.create_model_and_transforms(
        model_name, pretrained=pretrained, device=device
    )
    tokenizer = open_clip.get_tokenizer(model_name)

    model.eval()

    _CLIP["ready"] = True
    _CLIP["model"] = model
    _CLIP["preprocess"] = preprocess
    _CLIP["tokenizer"] = tokenizer
    _CLIP["device"] = device


def _encode_texts(texts: List[str]) -> np.ndarray:
    import torch
    _ensure_clip_loaded()
    model = _CLIP["model"]
    tokenizer = _CLIP["tokenizer"]
    device = _CLIP["device"]

    tokens = tokenizer(texts).to(device)
    with torch.no_grad():
        feats = model.encode_text(tokens)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy().astype(np.float32)


def _encode_image(image_path: Path) -> np.ndarray:
    import torch
    from PIL import Image
    _ensure_clip_loaded()
    model = _CLIP["model"]
    preprocess = _CLIP["preprocess"]
    device = _CLIP["device"]

    im = Image.open(image_path).convert("RGB")
    x = preprocess(im).unsqueeze(0).to(device)
    with torch.no_grad():
        feats = model.encode_image(x)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy().astype(np.float32).reshape(-1)


def ensure_category_embeddings(session: Session, model_key: str = MODEL_KEY_DEFAULT) -> None:
    """
    Ensure text embeddings exist for all active categories.
    If open_clip is not installed, do nothing (fallback mode).
    """
    if not _open_clip_available():
        return

    cats = session.exec(select(Category).where(Category.is_active == True).order_by(Category.sort_order.asc())).all()
    if not cats:
        return

    missing: List[Category] = []
    for c in cats:
        row = session.exec(
            select(CategoryEmbedding).where(CategoryEmbedding.category_id == c.id, CategoryEmbedding.model_key == model_key)
        ).first()
        if row is None:
            missing.append(c)

    if not missing:
        return

    vecs = _encode_texts([c.name for c in missing])  # shape (n, d)
    import datetime
    now = datetime.datetime.utcnow()

    for c, v in zip(missing, vecs):
        blob, dim = pack_f32(v)
        session.add(CategoryEmbedding(
            category_id=c.id,
            model_key=model_key,
            dim=dim,
            vector_blob=blob,
            updated_at=now
        ))
    session.flush()  # flush but don't commit - let caller manage transaction


def classify_and_store_item_embedding(
    session: Session,
    item_id: str,
    image_or_poster_path: Path,
    model_key: str = MODEL_KEY_DEFAULT,
) -> ClassifyResult:
    """
    Scheme A:
      - image embedding (or poster for video)
      - cosine vs category text embeddings
      - store item embedding
    Fallback if open_clip unavailable:
      - choose "创意" (or first active)
      - confidence None
      - no embedding stored
    """
    if not _open_clip_available():
        return ClassifyResult(auto_category_id=_fallback_category_id(session), confidence=None, item_vec=None)

    ensure_category_embeddings(session, model_key=model_key)

    cats = session.exec(select(Category).where(Category.is_active == True).order_by(Category.sort_order.asc())).all()
    if not cats:
        return ClassifyResult(auto_category_id=_fallback_category_id(session), confidence=None, item_vec=None)

    # Load category vectors
    cat_rows = session.exec(
        select(CategoryEmbedding).where(CategoryEmbedding.model_key == model_key)
    ).all()
    cat_map = {(r.category_id, r.model_key): r for r in cat_rows}

    cat_vecs: List[Tuple[str, np.ndarray]] = []
    for c in cats:
        r = cat_map.get((c.id, model_key))
        if r is None:
            continue
        cat_vecs.append((c.id, unpack_f32(r.vector_blob, r.dim)))

    if not cat_vecs:
        return ClassifyResult(auto_category_id=_fallback_category_id(session), confidence=None, item_vec=None)

    item_vec = _encode_image(image_or_poster_path)

    # argmax cosine
    best_id = cat_vecs[0][0]
    best_score = -1.0
    for cid, cv in cat_vecs:
        s = cosine(item_vec, cv)
        if s > best_score:
            best_score = s
            best_id = cid

    # store item embedding
    import datetime
    now = datetime.datetime.utcnow()
    blob, dim = pack_f32(item_vec)

    # Upsert (delete then insert) for simplicity
    existing = session.exec(
        select(ItemEmbedding).where(ItemEmbedding.item_id == item_id, ItemEmbedding.model_key == model_key)
    ).first()
    if existing:
        session.delete(existing)
        session.flush()

    session.add(ItemEmbedding(item_id=item_id, model_key=model_key, dim=dim, vector_blob=blob, created_at=now))
    session.flush()  # flush but don't commit - let caller manage transaction

    # confidence mapping: in CLIP normalized cosine often ~[-1,1], typical positives 0.2~0.4+
    # Keep raw cosine as "confidence" for now (stable + honest). Frontend can display as 0~1 later if needed.
    return ClassifyResult(auto_category_id=best_id, confidence=float(best_score), item_vec=item_vec)
