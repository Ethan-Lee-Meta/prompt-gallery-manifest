from __future__ import annotations
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Set
from sqlmodel import Session, select
from sqlalchemy import text, func
from fastapi import APIRouter, Depends, Query, UploadFile, File, BackgroundTasks
import hashlib

from app.db import get_session
from app.settings import settings
from app.util.text import normalize_text
from app.util.errors import raise_api_error
from app.models import Item, ItemVersion, Series, SeriesVersion, Tag, ItemTag, ItemEmbedding, SeriesTag
from app.services.fts import fts_rebuild_all, fts_delete_item
from app.services.thumbs import make_image_thumb, make_video_poster
from app.services.storage import safe_unlink
from pydantic import BaseModel, Field

import json
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from pathlib import Path
from datetime import datetime

from fastapi import Depends
from sqlmodel import Session, select

from app.db import get_session
from app.settings import settings
from app.models import Item
from app.services.storage import safe_unlink
from app.util.errors import raise_api_error

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from sqlmodel import select
from app.models import Item, Category
from app.services.auto_category import classify_item, serialize_candidates


router = APIRouter()

class PurgeDeletedRequest(BaseModel):
    confirm: str = Field(..., description='Must be exactly "PURGE"')
    limit: int = Field(default=500, ge=1, le=50000)
    purge_files: bool = True

class RepairMojibakeRequest(BaseModel):
    confirm: str = Field("DRYRUN", description='Use "FIX" to apply changes; otherwise dry-run')
    limit: int = Field(5000, ge=1, le=200000)
    include_deleted: bool = True

def _fts_exists(session: Session) -> bool:
    row = session.exec(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='items_fts' LIMIT 1")
    ).first()
    return bool(row)


@router.get("/_maintenance/diag")
def diag(session: Session = Depends(get_session)):
    storage_root = Path(settings.storage_root).resolve()

    items_total = int(session.exec(select(func.count()).select_from(Item)).one())
    series_total = int(session.exec(select(func.count()).select_from(Series)).one())
    item_versions_total = int(session.exec(select(func.count()).select_from(ItemVersion)).one())
    series_versions_total = int(session.exec(select(func.count()).select_from(SeriesVersion)).one())

    fts_ok = _fts_exists(session)
    fts_rows = 0
    if fts_ok:
        try:
            fts_rows = int(session.exec(text("SELECT COUNT(*) FROM items_fts")).one())
        except Exception:
            fts_rows = -1

    # sample recent items + file existence
    recent = session.exec(select(Item).order_by(Item.created_at.desc()).limit(8)).all()
    sample = []
    missing_count = 0

    for it in recent:
        media = (storage_root / (it.media_path or "")).resolve()
        thumb = (storage_root / (it.thumb_path or "")).resolve()
        poster = (storage_root / (it.poster_path or "")).resolve() if it.poster_path else None

        media_ok = media.exists()
        thumb_ok = thumb.exists()
        poster_ok = (poster.exists() if poster else None)

        if not media_ok or not thumb_ok or (it.media_type == "video" and poster is not None and not poster_ok):
            missing_count += 1

        sample.append({
            "id": it.id,
            "title": it.title,
            "media_type": it.media_type,
            "media_path": it.media_path,
            "thumb_path": it.thumb_path,
            "poster_path": it.poster_path,
            "exists": {"media": media_ok, "thumb": thumb_ok, "poster": poster_ok},
            "created_at": it.created_at.isoformat(),
        })

    return {
        "status": "ok",
        "now_utc": datetime.utcnow().isoformat(),
        "db": {"url": settings.database_url},
        "storage": {"root": str(storage_root)},
        "counts": {
            "items": items_total,
            "series": series_total,
            "item_versions": item_versions_total,
            "series_versions": series_versions_total,
        },
        "fts": {"exists": fts_ok, "rows": fts_rows},
        "recent_sample": sample,
        "recent_missing_files": missing_count,
    }


@router.post("/_maintenance/fts_rebuild")
def fts_rebuild(session: Session = Depends(get_session)):
    n = fts_rebuild_all(session)
    return {"status": "ok", "rebuilt": n}


@router.post("/_maintenance/repair_media")
def repair_media(
    session: Session = Depends(get_session),
    limit: int = 500,   # 默认修复最近 500 条，避免一次跑太久
):
    storage_root = Path(settings.storage_root).resolve()

    items = session.exec(select(Item).order_by(Item.created_at.desc()).limit(limit)).all()

    repaired_thumb = 0
    repaired_poster = 0
    missing_media = 0
    errors = []

    for it in items:
        media = (storage_root / (it.media_path or "")).resolve()
        thumb = (storage_root / (it.thumb_path or "")).resolve()
        poster = (storage_root / (it.poster_path or "")).resolve() if it.poster_path else None

        if not media.exists():
            missing_media += 1
            continue

        try:
            if it.media_type == "image":
                if not thumb.exists():
                    make_image_thumb(media, thumb, max_w=768)
                    repaired_thumb += 1
            else:
                # video
                if poster is not None and not poster.exists():
                    make_video_poster(media, poster, ss=0.5)
                    repaired_poster += 1
                if poster is not None and poster.exists() and not thumb.exists():
                    make_image_thumb(poster, thumb, max_w=768)
                    repaired_thumb += 1
        except Exception as e:
            errors.append({"item_id": it.id, "err": str(e)[:300]})

    return {
        "status": "ok",
        "scanned": len(items),
        "repaired": {"thumb": repaired_thumb, "poster": repaired_poster},
        "missing_media": missing_media,
        "errors_sample": errors[:20],
    }


@router.post("/_maintenance/purge_deleted")
def purge_deleted(req: PurgeDeletedRequest, session: Session = Depends(get_session)):
    """
    Permanently deletes soft-deleted items and their related rows + (optionally) files.
    Requires confirm="PURGE".
    """
    if req.confirm != "PURGE":
        return {"status": "error", "code": "CONFIRM_REQUIRED", "message": 'confirm must be exactly "PURGE"'}

    storage_root = Path(settings.storage_root).resolve()

    # pick oldest deleted first (stable)
    items = session.exec(
        select(Item)
        .where(Item.is_deleted == True)
        .order_by(Item.deleted_at.asc().nulls_last(), Item.created_at.asc())
        .limit(req.limit)
    ).all()

    deleted_items = 0
    deleted_versions = 0
    deleted_tags = 0
    deleted_embeddings = 0
    deleted_files = 0
    missing_files = 0
    errors: list[dict] = []
    sample_ids: list[str] = []

    for it in items:
        sample_ids.append(it.id)

        # prepare file paths
        rel_media = (it.media_path or "").replace("\\", "/").lstrip("/")
        rel_thumb = (it.thumb_path or "").replace("\\", "/").lstrip("/")
        rel_poster = (it.poster_path or "").replace("\\", "/").lstrip("/") if it.poster_path else None

        abs_media = (storage_root / rel_media).resolve() if rel_media else None
        abs_thumb = (storage_root / rel_thumb).resolve() if rel_thumb else None
        abs_poster = (storage_root / rel_poster).resolve() if rel_poster else None

        try:
            # 1) remove from FTS (best-effort)
            try:
                fts_delete_item(session, it.id)
            except Exception:
                pass

            # 2) delete child rows (explicit, no cascade assumption)
            # item_embeddings
            emb = session.exec(select(ItemEmbedding).where(ItemEmbedding.item_id == it.id)).all()
            for r in emb:
                session.delete(r)
            deleted_embeddings += len(emb)

            # item_tags
            links = session.exec(select(ItemTag).where(ItemTag.item_id == it.id)).all()
            for r in links:
                session.delete(r)
            deleted_tags += len(links)

            # item_versions
            vers = session.exec(select(ItemVersion).where(ItemVersion.item_id == it.id)).all()
            for r in vers:
                session.delete(r)
            deleted_versions += len(vers)

            # 3) delete item
            session.delete(it)

            session.commit()
            deleted_items += 1

            # 4) delete files after DB commit (so DB state is consistent even if fs fails)
            if req.purge_files:
                for p in [abs_media, abs_thumb, abs_poster]:
                    if not p:
                        continue
                    try:
                        if p.exists():
                            safe_unlink(p)
                            deleted_files += 1
                        else:
                            missing_files += 1
                    except Exception as e:
                        errors.append({"item_id": it.id, "stage": "delete_file", "path": str(p), "err": str(e)[:300]})

        except Exception as e:
            session.rollback()
            errors.append({"item_id": it.id, "stage": "db_delete", "err": str(e)[:400]})

    return {
        "status": "ok",
        "scanned": len(items),
        "deleted": {
            "items": deleted_items,
            "item_versions": deleted_versions,
            "item_tags": deleted_tags,
            "item_embeddings": deleted_embeddings,
            "files_deleted": deleted_files,
            "files_missing": missing_files,
        },
        "errors_sample": errors[:20],
        "sample_item_ids": sample_ids[:20],
    }

def _posix_rel(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    return p.replace("\\", "/").lstrip("/")


def _safe_under_root(root: Path, rel: Optional[str]) -> Optional[Path]:
    if not rel:
        return None
    try:
        rp = _posix_rel(rel)
        if not rp:
            return None
        abs_p = (root / rp).resolve()
        if str(abs_p).startswith(str(root.resolve())):
            return abs_p
        return None
    except Exception:
        return None


@router.get("/_maintenance/verify_storage")
def verify_storage(
    session: Session = Depends(get_session),
    limit: int = Query(2000, ge=1, le=50000),
    include_deleted: int = Query(1, ge=0, le=1),
    scan_files: int = Query(0, ge=0, le=1),
    max_files: int = Query(5000, ge=100, le=200000),
):
    """
    Verifies DB paths vs filesystem existence.
    - limit: how many items to scan (most recent first)
    - include_deleted=1 includes soft-deleted items in scan
    - scan_files=1 scans storage folders to find orphan files (not referenced by scanned items)
    """
    root = Path(settings.storage_root).resolve()

    stmt = select(Item).order_by(Item.created_at.desc()).limit(limit)
    if not include_deleted:
        stmt = stmt.where(Item.is_deleted == False)

    items = session.exec(stmt).all()

    missing_media = 0
    missing_thumb = 0
    missing_poster = 0
    invalid_path = 0

    samples = {
        "missing_media": [],
        "missing_thumb": [],
        "missing_poster": [],
        "invalid_path": [],
    }

    # referenced relpaths for orphan scan
    referenced: set[str] = set()

    def add_sample(key: str, it: Item, rel: Optional[str], note: Optional[str] = None):
        if len(samples[key]) >= 30:
            return
        samples[key].append({
            "item_id": it.id,
            "title": it.title,
            "media_type": it.media_type,
            "is_deleted": bool(getattr(it, "is_deleted", False)),
            "relpath": _posix_rel(rel),
            "note": note,
            "created_at": it.created_at.isoformat() if it.created_at else None,
        })

    for it in items:
        rel_media = _posix_rel(it.media_path)
        rel_thumb = _posix_rel(it.thumb_path)
        rel_poster = _posix_rel(it.poster_path) if it.poster_path else None

        # track referenced (for orphan scan)
        for r in [rel_media, rel_thumb, rel_poster]:
            if r:
                referenced.add(r)

        # validate paths are under root
        abs_media = _safe_under_root(root, rel_media)
        abs_thumb = _safe_under_root(root, rel_thumb)
        abs_poster = _safe_under_root(root, rel_poster) if rel_poster else None

        if rel_media and abs_media is None:
            invalid_path += 1
            add_sample("invalid_path", it, rel_media, "media_path not under storage_root")
        if rel_thumb and abs_thumb is None:
            invalid_path += 1
            add_sample("invalid_path", it, rel_thumb, "thumb_path not under storage_root")
        if rel_poster and abs_poster is None:
            invalid_path += 1
            add_sample("invalid_path", it, rel_poster, "poster_path not under storage_root")

        # existence checks (only if path valid)
        if abs_media is not None and not abs_media.exists():
            missing_media += 1
            add_sample("missing_media", it, rel_media)
        if abs_thumb is not None and not abs_thumb.exists():
            missing_thumb += 1
            add_sample("missing_thumb", it, rel_thumb)
        if it.media_type == "video" and abs_poster is not None and not abs_poster.exists():
            missing_poster += 1
            add_sample("missing_poster", it, rel_poster)

    orphans: Dict[str, Any] = {"enabled": bool(scan_files), "scanned": {}, "orphan_sample": []}

    if scan_files:
        def scan_dir(sub: str) -> Dict[str, Any]:
            base = (root / sub)
            if not base.exists():
                return {"dir": str(base), "exists": False, "scanned_files": 0, "orphan_count_est": 0, "orphan_sample": []}

            scanned = 0
            orphan_est = 0
            orphan_sample: list[str] = []

            # iterate with cap
            for p in base.rglob("*"):
                if not p.is_file():
                    continue
                scanned += 1
                if scanned > max_files:
                    break
                rel = p.relative_to(root).as_posix()
                if rel not in referenced:
                    orphan_est += 1
                    if len(orphan_sample) < 30:
                        orphan_sample.append(rel)

            return {
                "dir": str(base),
                "exists": True,
                "scanned_files": scanned,
                "orphan_count_est": orphan_est,
                "orphan_sample": orphan_sample,
            }

        orphans["scanned"]["media"] = scan_dir("media")
        orphans["scanned"]["thumb"] = scan_dir("thumb")
        orphans["scanned"]["poster"] = scan_dir("poster")

        # flattened sample (optional)
        for k in ["media", "thumb", "poster"]:
            for rel in orphans["scanned"][k].get("orphan_sample", []):
                if len(orphans["orphan_sample"]) >= 50:
                    break
                orphans["orphan_sample"].append({"bucket": k, "relpath": rel})

    return {
        "status": "ok",
        "now_utc": datetime.utcnow().isoformat(),
        "storage_root": str(root),
        "params": {
            "limit": limit,
            "include_deleted": bool(include_deleted),
            "scan_files": bool(scan_files),
            "max_files": max_files,
        },
        "scanned_items": len(items),
        "counts": {
            "missing_media": missing_media,
            "missing_thumb": missing_thumb,
            "missing_poster": missing_poster,
            "invalid_path": invalid_path,
        },
        "samples": samples,
        "orphans": orphans,
        "recommendations": [
            "If missing_thumb/poster is high: run POST /_maintenance/repair_media",
            "If missing_media is high: check storage_root mapping and your import/export warnings (MEDIA_MISSING)",
            "If orphans are high: consider purging or archiving orphan files after confirming they are not referenced",
        ],
    }

import re

_CJK = re.compile(r"[\u4e00-\u9fff]")
_LATIN1 = re.compile(r"[\u00A0-\u00FF]")

def _looks_like_mojibake(s: str) -> bool:
    if not s:
        return False
    # typical: lots of latin1-range characters, zero CJK
    return len(_CJK.findall(s)) == 0 and len(_LATIN1.findall(s)) >= 2

@router.post("/_maintenance/repair_mojibake")
def repair_mojibake(req: RepairMojibakeRequest, session: Session = Depends(get_session)):
    apply_fix = (req.confirm == "FIX")
    changed = 0
    scanned = 0
    samples = []

    def maybe_fix(table: str, row_id: str, field: str, old: str) -> str:
        nonlocal changed
        if not old:
            return old
        if not _looks_like_mojibake(old):
            return old
        new = normalize_text(old)
        # accept only if new contains CJK (very strong signal) and differs
        if new != old and len(_CJK.findall(new)) >= 1:
            changed += 1
            if len(samples) < 50:
                samples.append({"table": table, "id": row_id, "field": field, "before": old, "after": new})
            return new
        return old

    try:
        # Items
        item_stmt = select(Item).order_by(Item.created_at.desc()).limit(req.limit)
        if not req.include_deleted:
            item_stmt = item_stmt.where(Item.is_deleted == False)
        items = session.exec(item_stmt).all()

        for it in items:
            scanned += 1
            it.title = maybe_fix("items", it.id, "title", it.title or "")
            if apply_fix:
                session.add(it)

        # ItemVersions
        vs = session.exec(select(ItemVersion).order_by(ItemVersion.created_at.desc()).limit(req.limit)).all()
        for v in vs:
            scanned += 1
            v.prompt_blob = maybe_fix("item_versions", v.id, "prompt_blob", v.prompt_blob or "")
            if v.note:
                v.note = maybe_fix("item_versions", v.id, "note", v.note)
            if apply_fix:
                session.add(v)

        # Series
        ss = session.exec(select(Series).order_by(Series.updated_at.desc()).limit(req.limit)).all()
        for s in ss:
            scanned += 1
            s.name = maybe_fix("series", s.id, "name", s.name or "")
            if apply_fix:
                session.add(s)

        # SeriesVersions
        svs = session.exec(select(SeriesVersion).order_by(SeriesVersion.created_at.desc()).limit(req.limit)).all()
        for v in svs:
            scanned += 1
            v.base_prompt_blob = maybe_fix("series_versions", v.id, "base_prompt_blob", v.base_prompt_blob or "")
            if v.note:
                v.note = maybe_fix("series_versions", v.id, "note", v.note)
            if apply_fix:
                session.add(v)

        # Tags
        tags = session.exec(select(Tag).order_by(Tag.created_at.desc()).limit(req.limit)).all()
        for t in tags:
            scanned += 1
            t.name = maybe_fix("tags", t.id, "name", t.name or "")
            if apply_fix:
                session.add(t)

        if apply_fix:
            session.commit()
        else:
            session.rollback()

        return {
            "status": "ok",
            "applied": apply_fix,
            "scanned": scanned,
            "changed": changed,
            "sample": samples[:50],
            "note": 'Set confirm="FIX" to apply. Default is dry-run.',
        }

    except Exception as e:
        session.rollback()
        raise_api_error(500, "REPAIR_MOJIBAKE_FAILED", f"{str(e)[:400]}")

class BackfillShaRequest(BaseModel):
    limit: int = Field(2000, ge=1, le=200000)
    include_deleted: bool = True

@router.post("/_maintenance/backfill_media_sha256")
def backfill_media_sha256(req: BackfillShaRequest, session: Session = Depends(get_session)):
    root = Path(settings.storage_root).resolve()

    stmt = select(Item).order_by(Item.created_at.desc()).limit(req.limit)
    if not req.include_deleted:
        stmt = stmt.where(Item.is_deleted == False)

    items = session.exec(stmt).all()

    updated = 0
    missing_media = 0
    errors = []

    for it in items:
        if it.media_sha256:
            continue
        rel = (it.media_path or "").replace("\\", "/").lstrip("/")
        p = (root / rel).resolve()
        if not p.exists():
            missing_media += 1
            continue
        try:
            h = hashlib.sha256()
            with p.open("rb") as f:
                while True:
                    chunk = f.read(1024 * 1024)
                    if not chunk:
                        break
                    h.update(chunk)
            it.media_sha256 = h.hexdigest()
            session.add(it)
            updated += 1
        except Exception as e:
            errors.append({"item_id": it.id, "err": str(e)[:200]})

    session.commit()
    return {"status": "ok", "updated": updated, "missing_media": missing_media, "errors_sample": errors[:20]}

class TrashMissingFilesRequest(BaseModel):
    limit: int = Field(5000, ge=1, le=200000)
    include_deleted: bool = False          # 默认只处理 active
    dry_run: bool = True                   # 默认 dry-run
    reason: str = Field("missing_files")   # 记录到 warning/日志用途（当前仅回传）

def _exists_under_root(root: Path, rel: Optional[str]) -> Optional[bool]:
    if rel is None:
        return None
    rp = rel.replace("\\", "/").lstrip("/")
    if not rp:
        return None
    try:
        p = (root / rp).resolve()
        if not str(p).startswith(str(root.resolve())):
            return None
        return p.exists()
    except Exception:
        return None


@router.post("/_maintenance/trash_missing_files")
def trash_missing_files(req: TrashMissingFilesRequest, session: Session = Depends(get_session)):
    """
    Moves items with missing media/thumb/poster into trash (soft delete).
    Safe by default: dry_run=True.
    """
    root = Path(settings.storage_root).resolve()
    now = datetime.utcnow()

    stmt = select(Item).order_by(Item.created_at.desc()).limit(req.limit)
    if not req.include_deleted:
        stmt = stmt.where(Item.is_deleted == False)

    items = session.exec(stmt).all()

    missing = []
    scanned = 0

    for it in items:
        scanned += 1
        media_ok = _exists_under_root(root, it.media_path)  # True/False/None
        thumb_ok = _exists_under_root(root, it.thumb_path)
        poster_ok = _exists_under_root(root, it.poster_path) if it.media_type == "video" else None

        # treat None (invalid path) as missing
        is_missing = (media_ok is not True) or (thumb_ok is not True) or (it.media_type == "video" and poster_ok is not True)

        if is_missing:
            missing.append({
                "item_id": it.id,
                "title": it.title,
                "media_type": it.media_type,
                "is_deleted": bool(it.is_deleted),
                "paths": {
                    "media": it.media_path,
                    "thumb": it.thumb_path,
                    "poster": it.poster_path,
                },
                "exists": {
                    "media": media_ok,
                    "thumb": thumb_ok,
                    "poster": poster_ok,
                },
                "created_at": it.created_at.isoformat() if it.created_at else None,
            })

    # dry run: just report
    if req.dry_run:
        return {
            "status": "ok",
            "dry_run": True,
            "reason": req.reason,
            "scanned": scanned,
            "missing_count": len(missing),
            "missing_sample": missing[:50],
        }

    # apply: soft delete those not already deleted
    ids = [m["item_id"] for m in missing]
    ids = list(dict.fromkeys(ids))

    trashed = 0
    for iid in ids:
        it = session.get(Item, iid)
        if not it or it.is_deleted:
            continue
        it.is_deleted = True
        it.deleted_at = now
        it.updated_at = now
        session.add(it)
        trashed += 1

    session.commit()

    # remove from FTS best-effort
    for iid in ids:
        try:
            fts_delete_item(session, iid)
        except Exception:
            pass

    return {
        "status": "ok",
        "dry_run": False,
        "reason": req.reason,
        "scanned": scanned,
        "missing_count": len(missing),
        "trashed": trashed,
        "missing_sample": missing[:50],
    }

class OrphansRequest(BaseModel):
    # scan scope
    bucket: str = Field("all", description='all|media|thumb|poster')
    include_deleted: bool = True               # 默认把回收站条目也视为“引用”，避免误删可恢复内容
    max_scan_files: int = Field(50000, ge=100, le=500000)   # 每个 bucket 最多扫描多少个文件
    max_orphans: int = Field(5000, ge=100, le=200000)       # 最多返回/处理多少个孤儿文件

    # execution
    dry_run: bool = True
    confirm: str = Field("DRYRUN", description='Use "DELETE" to apply deletion')


def _rel_norm(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    return p.replace("\\", "/").lstrip("/")


def _build_referenced_set(session: Session, include_deleted: bool) -> set[str]:
    """
    Build a set of referenced relative paths from DB (media/thumb/poster only).
    """
    stmt = select(Item.media_path, Item.thumb_path, Item.poster_path)
    if not include_deleted:
        stmt = stmt.where(Item.is_deleted == False)
    rows = session.exec(stmt).all()

    ref = set()
    for r in rows:
        # SQLModel may return tuple-like
        media = r[0] if isinstance(r, (tuple, list)) else None
        thumb = r[1] if isinstance(r, (tuple, list)) else None
        poster = r[2] if isinstance(r, (tuple, list)) else None

        for x in (media, thumb, poster):
            rr = _rel_norm(x)
            if rr:
                ref.add(rr)
    return ref


def _scan_bucket(root: Path, bucket: str, referenced: set[str], max_scan_files: int, max_orphans: int) -> dict:
    """
    Scan one bucket directory under storage_root and find files not in referenced set.
    Returns orphan list (capped) + counts.
    """
    base = (root / bucket).resolve()
    if not base.exists():
        return {"bucket": bucket, "dir": str(base), "exists": False, "scanned_files": 0, "orphan_count": 0, "orphans": []}

    scanned = 0
    orphan_count = 0
    orphans: list[str] = []

    for p in base.rglob("*"):
        if not p.is_file():
            continue
        scanned += 1
        if scanned > max_scan_files:
            break
        rel = p.relative_to(root).as_posix()
        if rel not in referenced:
            orphan_count += 1
            if len(orphans) < max_orphans:
                orphans.append(rel)

    return {
        "bucket": bucket,
        "dir": str(base),
        "exists": True,
        "scanned_files": scanned,
        "orphan_count": orphan_count,
        "orphans": orphans,
        "hit_max_scan_files": scanned > max_scan_files,
        "hit_max_orphans": len(orphans) >= max_orphans,
    }


def _write_report(root: Path, name: str, payload: dict) -> str:
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    rel = f"reports/{name}_{ts}.json"
    abs_p = (root / rel).resolve()
    abs_p.parent.mkdir(parents=True, exist_ok=True)
    abs_p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return f"/files/{rel}"

@router.post("/_maintenance/orphans")
def orphans_scan_or_purge(req: OrphansRequest, session: Session = Depends(get_session)):
    """
    Orphan files tool:
    - dry_run=True: scan and report orphans (no deletion)
    - dry_run=False + confirm="DELETE": delete scanned orphans (only the returned/capped list)
    Buckets limited to media/thumb/poster.
    """
    bucket = (req.bucket or "all").strip().lower()
    if bucket not in ("all", "media", "thumb", "poster"):
        raise_api_error(400, "INVALID_BUCKET", "bucket must be all|media|thumb|poster", {"bucket": bucket})

    if not req.dry_run and req.confirm != "DELETE":
        raise_api_error(400, "CONFIRM_REQUIRED", 'confirm must be exactly "DELETE" to apply deletion')

    root = Path(settings.storage_root).resolve()

    referenced = _build_referenced_set(session, include_deleted=req.include_deleted)

    buckets = ["media", "thumb", "poster"] if bucket == "all" else [bucket]
    scans = []
    all_orphans: list[dict] = []  # [{bucket, relpath}]
    total_scanned_files = 0
    total_orphan_count = 0

    for b in buckets:
        out = _scan_bucket(root, b, referenced, req.max_scan_files, req.max_orphans)
        scans.append(out)
        total_scanned_files += out.get("scanned_files", 0)
        total_orphan_count += out.get("orphan_count", 0)
        for rel in out.get("orphans", []):
            if len(all_orphans) >= req.max_orphans:
                break
            all_orphans.append({"bucket": b, "relpath": rel})

    deleted = 0
    missing = 0
    errors: list[dict] = []

    if not req.dry_run:
        for o in all_orphans:
            rel = o["relpath"]
            abs_p = (root / rel).resolve()
            # safety: must be under root and within expected bucket
            if not str(abs_p).startswith(str(root)):
                continue
            try:
                if abs_p.exists():
                    safe_unlink(abs_p)
                    deleted += 1
                else:
                    missing += 1
            except Exception as e:
                errors.append({"relpath": rel, "err": str(e)[:300]})

    report = {
        "status": "ok",
        "now_utc": datetime.utcnow().isoformat(),
        "dry_run": req.dry_run,
        "bucket": bucket,
        "include_deleted": req.include_deleted,
        "max_scan_files": req.max_scan_files,
        "max_orphans": req.max_orphans,
        "referenced_count": len(referenced),
        "total_scanned_files": total_scanned_files,
        "total_orphan_count": total_orphan_count,  # may exceed returned list (if capped)
        "scans": scans,
        "orphans_returned": all_orphans,            # capped list to act on
        "deleted": deleted,
        "missing": missing,
        "errors_sample": errors[:20],
        "notes": [
            "orphans_returned is capped by max_orphans; total_orphan_count can be larger.",
            "Deletion only affects orphans_returned (scanned + capped). Re-run if needed.",
            "Default include_deleted=true avoids deleting files referenced by trash items that might be restored.",
        ],
    }

    report_url = _write_report(root, "orphans_report", report)
    return {**report, "report_url": report_url}

class ReclassifyRequest(BaseModel):
    limit: int = Field(5000, ge=1, le=200000)
    threshold: Optional[float] = None
    dry_run: bool = True
    include_deleted: bool = True
    force: bool = False  # 强制覆盖 category_id（默认 False）
    only_uncategorized: bool = True  # 默认只改“未分类”

@router.post("/_maintenance/reclassify_items")
def reclassify_items(req: ReclassifyRequest, session: Session = Depends(get_session)):
    thr = float(req.threshold) if req.threshold is not None else float(settings.auto_cat_threshold)

    # ensure uncategorized exists
    from app.services.auto_category import ensure_uncategorized
    unc = ensure_uncategorized(session)

    stmt = select(Item).order_by(Item.created_at.desc()).limit(req.limit)
    if not req.include_deleted:
        stmt = stmt.where(Item.is_deleted == False)

    items = session.exec(stmt).all()

    scanned = 0
    would_update = 0
    applied = 0
    samples = []

    now = datetime.utcnow()

    for it in items:
        scanned += 1

        # Skip items with manually locked categories (unless force=True)
        if it.is_category_locked and not req.force:
            continue

        prev_cat = it.category_id
        prev_auto = it.auto_category_id
        prev_conf = it.auto_confidence

        unc2, best, top = classify_item(session, it.id, topk=3, threshold=thr, include_deleted_for_prototypes=req.include_deleted)

        # compute next fields
        next_auto_id = best.category_id if best else None
        next_conf = best.score if best else None
        next_candidates_json = serialize_candidates(top) if top else None
        next_cat = (best.category_id if (best and best.score >= thr) else unc.id)

        # decide whether to change final category_id
        # If category is locked, never change category_id (but can still update auto_* fields)
        allow_change = req.force and not it.is_category_locked
        if not allow_change and not it.is_category_locked:
            # safe mode:
            # 1) only_uncategorized: only change if current category is uncategorized
            if req.only_uncategorized and prev_cat == unc.id:
                allow_change = True
            # 2) or if current category equals previous auto_category_id (not manually overridden)
            elif (not req.only_uncategorized) and prev_auto and prev_cat == prev_auto:
                allow_change = True

        will_change = False
        # always refresh auto_* fields if we have candidates
        will_change = will_change or (next_candidates_json != (it.auto_candidates_json or None)) \
                      or (next_auto_id != prev_auto) \
                      or (next_conf != prev_conf)

        if allow_change and next_cat != prev_cat:
            will_change = True

        if will_change:
            would_update += 1
            if len(samples) < 50:
                samples.append({
                    "item_id": it.id,
                    "title": it.title,
                    "prev": {"category_id": prev_cat, "auto_category_id": prev_auto, "auto_conf": prev_conf},
                    "next": {"category_id": (next_cat if allow_change else prev_cat), "auto_category_id": next_auto_id, "auto_conf": next_conf},
                })

        if req.dry_run:
            continue

        # apply changes
        it.auto_candidates_json = next_candidates_json
        it.auto_category_id = next_auto_id
        it.auto_confidence = next_conf
        if allow_change:
            it.category_id = next_cat
        it.updated_at = now
        session.add(it)
        applied += 1

    if not req.dry_run:
        session.commit()

    return {
        "status": "ok",
        "dry_run": req.dry_run,
        "threshold": thr,
        "scanned": scanned,
        "would_update": would_update,
        "applied": (0 if req.dry_run else applied),
        "sample": samples,
        "uncategorized_id": unc.id,
    }

@router.get("/_maintenance/config")
def maintenance_config(session: Session = Depends(get_session)):
    # IMPORTANT: only expose non-secret, non-provider credentials.
    return {
        "status": "ok",
        "auto_category": {
            "threshold": float(settings.auto_cat_threshold),
            "topk": int(settings.auto_cat_topk),

            "min_samples_per_cat": int(settings.auto_cat_min_samples_per_cat),
            "sample_per_cat": int(settings.auto_cat_sample_per_cat),

            "face_boost": float(settings.auto_cat_face_boost),
            "face_near_band": float(settings.auto_cat_face_near_band),

            "text_boost": float(settings.auto_cat_text_boost),
            "text_near_band": float(settings.auto_cat_text_near_band),

            "face_keywords": settings.auto_cat_face_keywords,
            "person_text_keywords": settings.auto_cat_person_text_keywords,
        },
    }
