from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional, List, Dict, Tuple
from datetime import datetime
from pathlib import Path
import math

from sqlmodel import Session, select
from app.models import Item, Category, ItemEmbedding
from app.settings import settings

from app.settings import settings


@dataclass
class Candidate:
    category_id: str
    category_name: str
    score: float


def _split_keywords(s: str) -> tuple[str, ...]:
    if not s:
        return tuple()
    return tuple(x.strip().lower() for x in s.split(",") if x.strip())


def _load_embedding(session: Session, item_id: str) -> Optional[List[float]]:
    emb = session.exec(select(ItemEmbedding).where(ItemEmbedding.item_id == item_id)).first()
    if not emb:
        return None

    blob = getattr(emb, "embedding_blob", None)
    if blob is None:
        blob = getattr(emb, "embedding", None)
    if blob is None:
        return None

    try:
        import numpy as np
        v = np.frombuffer(blob, dtype=np.float32)
        if v.size == 0:
            return None
        return v.astype(float).tolist()
    except Exception:
        # no numpy: fallback
        import struct
        n = len(blob) // 4
        if n <= 0:
            return None
        return list(struct.unpack("<" + "f" * n, blob[: n * 4]))


def _cosine(a: List[float], b: List[float]) -> float:
    # cosine similarity
    dot = 0.0
    na = 0.0
    nb = 0.0
    for i in range(min(len(a), len(b))):
        x = float(a[i]); y = float(b[i])
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def _face_present_for_item(session: Session, item_id: str) -> bool:
    """
    Very lightweight face hint:
    - Uses OpenCV Haar cascade if available
    - Returns False if cv2 missing or image cannot be read
    """
    try:
        import cv2  # type: ignore
    except Exception:
        return False

    it = session.get(Item, item_id)
    if not it:
        return False

    # prefer thumb/poster (smaller) for speed
    rel = it.thumb_path or it.poster_path or it.media_path
    if not rel:
        return False

    relp = rel.replace("\\", "/").lstrip("/")
    root = Path(settings.storage_root).resolve()
    p = (root / relp).resolve()
    if not str(p).startswith(str(root)) or not p.exists():
        return False

    img = cv2.imread(str(p))
    if img is None:
        return False

    # downscale for speed
    h, w = img.shape[:2]
    mx = max(h, w)
    if mx > 640:
        scale = 640.0 / float(mx)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    try:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        detector = cv2.CascadeClassifier(cascade_path)
        faces = detector.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=4,
            minSize=(40, 40),
        )
        return len(faces) > 0
    except Exception:
        return False

def _normalize_text_for_match(s: str) -> str:
    if not s:
        return ""
    return s.strip().lower()


def _person_text_present(session: Session, item_id: str, person_text_keywords: tuple[str, ...]) -> bool:
    """
    Cheap text hint: looks at item title, tags, prompt_blob, series name/base prompt.
    Returns True if any PERSON_TEXT_KEYWORDS is present.
    """
    it = session.get(Item, item_id)
    if not it:
        return False

    parts: list[str] = []

    # title
    if it.title:
        parts.append(it.title)

    # tags (stored in tag table; reuse your tag loader if exists, else best-effort)
    try:
        from app.routes.items import _load_item_tags  # if accessible
        tags = _load_item_tags(session, it.id)
        parts.extend(tags or [])
    except Exception:
        # ignore if circular import
        pass

    # prompt blob (current version)
    try:
        from app.models import ItemVersion
        from sqlmodel import select
        v = session.exec(
            select(ItemVersion)
            .where(ItemVersion.item_id == it.id)
            .order_by(ItemVersion.v.desc())
        ).first()
        if v and v.prompt_blob:
            parts.append(v.prompt_blob)
    except Exception:
        pass

    # series name + base prompt (if any)
    try:
        if it.series_id:
            from app.models import Series, SeriesVersion
            srow = session.get(Series, it.series_id)
            if srow and srow.name:
                parts.append(srow.name)
            if srow and srow.current_version_id:
                sv = session.get(SeriesVersion, srow.current_version_id)
                if sv and sv.base_prompt_blob:
                    parts.append(sv.base_prompt_blob)
    except Exception:
        pass

    blob = _normalize_text_for_match(" ".join(parts))
    if not blob:
        return False

    for kw in person_text_keywords:
        if kw in blob:
            return True

    return False


def ensure_uncategorized(session: Session) -> Category:
    c = session.exec(select(Category).where(Category.name == "未分类")).first()
    if c:
        return c
    # create on the fly (safe even if migration not seeded)
    now = datetime.utcnow()
    from app.util.ids import new_id  # same helper you used elsewhere
    c = Category(
        id=new_id(),
        name="未分类",
        sort_order=0,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    session.add(c)
    session.commit()
    return c


def _build_centroids(session: Session, include_deleted: bool) -> Dict[str, Tuple[str, List[float], int]]:
    """
    Returns {category_id: (category_name, centroid_vec, n_samples)} using existing labeled items.
    """
    cats = session.exec(select(Category).where(Category.is_active == True)).all()
    cat_map = {c.id: c.name for c in cats if c.name != "未分类"}

    sample_per_cat = settings.auto_cat_sample_per_cat
    min_samples = settings.auto_cat_min_samples_per_cat

    centroids: Dict[str, Tuple[str, List[float], int]] = {}
    # for each category, collect sample embeddings from items already labeled with that category
    for cid, cname in cat_map.items():
        stmt = select(Item.id).where(Item.category_id == cid)
        if not include_deleted:
            stmt = stmt.where(Item.is_deleted == False)
        stmt = stmt.order_by(Item.created_at.desc()).limit(sample_per_cat)
        ids = session.exec(stmt).all()
        ids = [r if isinstance(r, str) else r[0] for r in ids]

        vecs = []
        for iid in ids:
            v = _load_embedding(session, iid)
            if v is not None:
                vecs.append(v)

        if len(vecs) < min_samples:
            continue

        # centroid = mean
        dim = len(vecs[0])
        acc = [0.0] * dim
        n = 0
        for v in vecs:
            if len(v) != dim:
                continue
            for i in range(dim):
                acc[i] += float(v[i])
            n += 1
        if n < min_samples:
            continue
        centroid = [x / n for x in acc]
        centroids[cid] = (cname, centroid, n)

    return centroids


def classify_item(
    session: Session,
    item_id: str,
    topk: Optional[int] = None,
    threshold: Optional[float] = None,
    include_deleted_for_prototypes: bool = True,
) -> Tuple[Category, Optional[Candidate], List[Candidate]]:
    """
    Returns (uncategorized_category, best_candidate_or_None, topk_candidates).
    If no embedding/prototypes, candidates will be empty.
    """
    if topk is None:
        topk = int(settings.auto_cat_topk)
    if threshold is None:
        threshold = float(settings.auto_cat_threshold)

    face_keywords = _split_keywords(settings.auto_cat_face_keywords)
    person_text_keywords = _split_keywords(settings.auto_cat_person_text_keywords)

    face_boost = float(settings.auto_cat_face_boost)
    face_band = float(settings.auto_cat_face_near_band)

    text_boost = float(settings.auto_cat_text_boost)
    text_band = float(settings.auto_cat_text_near_band)

    unc = ensure_uncategorized(session)

    emb = _load_embedding(session, item_id)
    if emb is None:
        return unc, None, []

    centroids = _build_centroids(session, include_deleted=include_deleted_for_prototypes)
    if not centroids:
        return unc, None, []

    cands: List[Candidate] = []
    for cid, (cname, centroid, n) in centroids.items():
        score = _cosine(emb, centroid)
        cands.append(Candidate(category_id=cid, category_name=cname, score=float(score)))

    cands.sort(key=lambda x: x.score, reverse=True)
    top = cands[: max(1, topk)]
    best = top[0] if top else None

    # ---- text hint boost ----
    if best is not None and best.score < (threshold + text_band):
        if _person_text_present(session, item_id, person_text_keywords):
            for c in cands:
                # category name match by face_keywords (肖像/角色/人物/人像)
                name_l = (c.category_name or "").lower()
                if any(k in name_l for k in face_keywords):
                    c.score = float(min(1.0, c.score + text_boost))
            cands.sort(key=lambda x: x.score, reverse=True)
            top = cands[: max(1, topk)]
            best = top[0] if top else None

    # ---- face hint boost ----
    if best is not None and best.score < (threshold + face_band):
        if _face_present_for_item(session, item_id):
            for c in cands:
                name_l = (c.category_name or "").lower()
                if any(k in name_l for k in face_keywords):
                    c.score = float(min(1.0, c.score + face_boost))
            cands.sort(key=lambda x: x.score, reverse=True)
            top = cands[: max(1, topk)]
            best = top[0] if top else None

    return unc, best, top


def serialize_candidates(cands: List[Candidate]) -> str:
    return json.dumps(
        [{"category_id": c.category_id, "category_name": c.category_name, "score": c.score} for c in cands],
        ensure_ascii=False,
    )
