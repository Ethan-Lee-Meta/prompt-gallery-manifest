from __future__ import annotations

import json
import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, Request, Query
from sqlmodel import Session, select

from app.db import get_session
from app.settings import settings
from sqlalchemy import func, text as sa_text
from app.models import (
    Tool, Category, Series,
    Item, ItemVersion,
    Tag, ItemTag,
)
from app.schemas import (
    ItemCreateMeta, ItemDTO, PageDTO,
    ToolDTO, CategoryDTO, SeriesSnapshotDTO,
    ItemVersionDTO, AutoCategoryDTO, AutoCandidateDTO,
    ItemPatch, ItemVersionCreate,
)
from app.services.auto_category import classify_item, serialize_candidates
from app.util.ids import new_id
from app.util.errors import raise_api_error
from app.services.storage import save_uploadfile_streaming, safe_unlink
from app.services.thumbs import make_image_thumb, make_video_poster
from app.services.classify import classify_and_store_item_embedding
from app.services.fts import fts_upsert_item, fts_search_ids_join_items
from app.util.text import normalize_text, normalize_list
from app.schemas import ItemsBulkPatch
from app.models import Series
from app.services.fts import fts_upsert_item
from app.util.text import normalize_list
from app.services.fts import fts_delete_item, fts_upsert_item
from app.schemas import ItemsBulkIds


from pathlib import Path
from app.schemas import ItemsBulkPurgeRequest
from app.models import ItemVersion, ItemTag, ItemEmbedding
from app.services.fts import fts_delete_item
from app.services.storage import safe_unlink
from app.settings import settings

from sqlalchemy import func
from app.schemas import DuplicatePageDTO, DuplicateGroupDTO, DuplicateItemLiteDTO
from app.models import Tool



router = APIRouter()


def _posix_rel(p: Path) -> str:
    return str(p).replace("\\", "/")


def _file_url(rel_path: str) -> str:
    rel_path = rel_path.lstrip("/")
    return f"/files/{rel_path}"


def _guess_media_type(upload: UploadFile, filename: str) -> tuple[str, str]:
    """
    Returns (media_type, ext_with_dot).
    media_type: "image" or "video"
    """
    name = (filename or "").lower()
    ct = (upload.content_type or "").lower()

    # Prefer explicit content_type
    if ct.startswith("image/"):
        ext = Path(name).suffix or mimetypes.guess_extension(ct) or ".jpg"
        return "image", ext
    if ct.startswith("video/"):
        ext = Path(name).suffix or mimetypes.guess_extension(ct) or ".mp4"
        return "video", ext

    # Fallback by extension
    ext = Path(name).suffix
    if ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
        return "image", ext
    if ext in (".mp4", ".mov", ".webm", ".mkv"):
        return "video", ext

    raise ValueError(f"unsupported file type: content_type={upload.content_type} filename={filename}")


def _upsert_tags(session: Session, names: list[str]) -> list[str]:
    out_ids: list[str] = []
    for raw in names:
        name = (raw or "").strip()
        if not name:
            continue

        existing = session.exec(select(Tag).where(Tag.name == name)).first()
        if existing:
            out_ids.append(existing.id)
            continue

        tid = new_id()
        session.add(Tag(id=tid, name=name, created_at=datetime.utcnow()))
        session.flush()
        out_ids.append(tid)
    return out_ids


def _set_item_tags_replace_all(session: Session, item_id: str, tag_names: list[str]) -> list[str]:
    # delete all links then insert
    links = session.exec(select(ItemTag).where(ItemTag.item_id == item_id)).all()
    for lk in links:
        session.delete(lk)

    tag_ids = _upsert_tags(session, tag_names)
    now = datetime.utcnow()
    for tid in tag_ids:
        session.add(ItemTag(item_id=item_id, tag_id=tid, created_at=now))
    return tag_ids


def _load_item_tags(session: Session, item_id: str) -> list[str]:
    # join item_tags -> tags
    tag_ids = [r.tag_id for r in session.exec(select(ItemTag).where(ItemTag.item_id == item_id)).all()]
    if not tag_ids:
        return []
    tags = session.exec(select(Tag).where(Tag.id.in_(tag_ids))).all()
    # preserve input order loosely by name
    return sorted([t.name for t in tags])


def _build_item_dto(session: Session, item: Item) -> ItemDTO:
    tool = session.get(Tool, item.tool_id)
    if not tool:
        raise RuntimeError("item.tool not found")

    category = session.get(Category, item.category_id)
    if not category:
        raise RuntimeError("item.category not found")

    auto_cat = None
    if item.auto_category_id:
        ac = session.get(Category, item.auto_category_id)
        if ac:
            auto_cat = AutoCategoryDTO(
                category=CategoryDTO.model_validate(ac),
                confidence=item.auto_confidence,
            )

    v = None
    if item.current_version_id:
        v = session.get(ItemVersion, item.current_version_id)
    if not v:
        # fallback: pick latest by v
        v = session.exec(
            select(ItemVersion).where(ItemVersion.item_id == item.id).order_by(ItemVersion.v.desc())
        ).first()
    if not v:
        raise RuntimeError("item.version not found")

    tags = _load_item_tags(session, item.id)

    series_snap = SeriesSnapshotDTO(
        id=item.series_id,
        name_snapshot=item.series_name_snapshot,
        delimiter_snapshot=item.delimiter_snapshot,
    )

    auto_candidates = []
    try:
        raw = json.loads(item.auto_candidates_json or "[]")
        for r in raw[:3]:
            auto_candidates.append(AutoCandidateDTO(
                category={"id": r.get("category_id"), "name": r.get("category_name")},
                score=float(r.get("score") or 0.0),
            ))
    except Exception:
        auto_candidates = []

    return ItemDTO(
        id=item.id,
        title=item.title,
        tool=ToolDTO.model_validate(tool),
        media_type=item.media_type,  # type: ignore
        media_url=_file_url(item.media_path),
        thumb_url=_file_url(item.thumb_path),
        poster_url=_file_url(item.poster_path) if item.poster_path else None,
        series=series_snap,
        category=CategoryDTO.model_validate(category),
        auto_category=auto_cat,
        auto_candidates=auto_candidates,
        tags=tags,
        current_version=ItemVersionDTO.model_validate(v),
        created_at=item.created_at,
        updated_at=item.updated_at,
        is_deleted=bool(item.is_deleted),
        deleted_at=item.deleted_at,
        media_sha256=item.media_sha256,
    )


def _normalize_scalar_ids(raw_list):
    """
    SQLModel may return scalars (str) or rows (tuple/Row).
    Normalize to list[str].
    """
    out = []
    for r in raw_list:
        if r is None:
            continue
        if isinstance(r, (tuple, list)):
            out.append(r[0])
        else:
            out.append(r)
    return out


@router.get("/items", response_model=PageDTO)
def list_items(
    session: Session = Depends(get_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=200),
    q: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    tool_id: Optional[str] = Query(None),
    series_id: Optional[str] = Query(None),
    media_type: Optional[str] = Query(None),
    tag: Optional[list[str]] = Query(None),  # repeatable: ?tag=a&tag=b
    include_deleted: int = Query(0),
    only_deleted: int = Query(0),
):
    def apply_filters(stmt):
        if category_id:
            stmt = stmt.where(Item.category_id == category_id)
        if tool_id:
            stmt = stmt.where(Item.tool_id == tool_id)
        if series_id:
            stmt = stmt.where(Item.series_id == series_id)
        if media_type:
            stmt = stmt.where(Item.media_type == media_type)

        if not include_deleted:
            stmt = stmt.where(Item.is_deleted == False)
        elif only_deleted:
            stmt = stmt.where(Item.is_deleted == True)

        return stmt

    # tag AND filter
    tag_ids_filter = None
    if tag:
        tags = [t.strip() for t in tag if t and t.strip()]
        tags = list(dict.fromkeys(tags))
        if tags:
            tag_ids_filter = (
                select(ItemTag.item_id)
                .join(Tag, Tag.id == ItemTag.tag_id)
                .where(Tag.name.in_(tags))
                .group_by(ItemTag.item_id)
                .having(func.count(func.distinct(Tag.name)) == len(tags))
            )

    # ----------------------------
    # q path: try FTS first
    # ----------------------------
    if q and q.strip():
        filters = []
        params = {}

        if category_id:
            filters.append("items.category_id = :category_id")
            params["category_id"] = category_id
        if tool_id:
            filters.append("items.tool_id = :tool_id")
            params["tool_id"] = tool_id
        if series_id:
            filters.append("items.series_id = :series_id")
            params["series_id"] = series_id
        if media_type:
            filters.append("items.media_type = :media_type")
            params["media_type"] = media_type

        if not include_deleted:
            filters.append("items.is_deleted = 0")
        elif only_deleted:
            filters.append("items.is_deleted = 1")

        if tag_ids_filter is not None:
            tags = [t.strip() for t in tag if t and t.strip()]
            tags = list(dict.fromkeys(tags))
            in_params = {f"tag_{i}": tags[i] for i in range(len(tags))}
            params.update(in_params)
            placeholders = ", ".join([f":tag_{i}" for i in range(len(tags))])
            filters.append(
                f"""items.id IN (
                    SELECT item_tags.item_id
                    FROM item_tags
                    JOIN tags ON tags.id = item_tags.tag_id
                    WHERE tags.name IN ({placeholders})
                    GROUP BY item_tags.item_id
                    HAVING COUNT(DISTINCT tags.name) = {len(tags)}
                )"""
            )

        filters_sql = " AND ".join(filters)

        total_fts, ids_fts = fts_search_ids_join_items(
            session=session,
            q=q,
            filters_sql=filters_sql,
            params=params,
            limit=page_size,
            offset=(page - 1) * page_size,
        )

        # FTS hit: preserve FTS order
        if total_fts > 0 and ids_fts:
            rows = session.exec(select(Item).where(Item.id.in_(ids_fts))).all()
            by_id = {r.id: r for r in rows}
            ordered = [by_id[i] for i in ids_fts if i in by_id]
            return PageDTO(
                items=[_build_item_dto(session, it) for it in ordered],
                page=page,
                page_size=page_size,
                total=total_fts,
            )

        # ----------------------------
        # FTS fallback: LIKE search across title/series/prompt/tags
        # ----------------------------
        qq = f"%{q.strip()}%"

        # total (distinct items)
        total_stmt = select(func.count(func.distinct(Item.id))).select_from(Item)
        total_stmt = total_stmt.join(ItemVersion, ItemVersion.id == Item.current_version_id, isouter=True)
        total_stmt = total_stmt.join(ItemTag, ItemTag.item_id == Item.id, isouter=True)
        total_stmt = total_stmt.join(Tag, Tag.id == ItemTag.tag_id, isouter=True)
        total_stmt = apply_filters(total_stmt)
        if tag_ids_filter is not None:
            total_stmt = total_stmt.where(Item.id.in_(tag_ids_filter))
        total_stmt = total_stmt.where(
            (Item.title.like(qq)) |
            (Item.series_name_snapshot.like(qq)) |
            (ItemVersion.prompt_blob.like(qq)) |
            (Tag.name.like(qq))
        )
        total_fb = int(session.exec(total_stmt).one())

        # page ids
        ids_stmt = select(Item.id).distinct().select_from(Item)
        ids_stmt = ids_stmt.join(ItemVersion, ItemVersion.id == Item.current_version_id, isouter=True)
        ids_stmt = ids_stmt.join(ItemTag, ItemTag.item_id == Item.id, isouter=True)
        ids_stmt = ids_stmt.join(Tag, Tag.id == ItemTag.tag_id, isouter=True)
        ids_stmt = apply_filters(ids_stmt)
        if tag_ids_filter is not None:
            ids_stmt = ids_stmt.where(Item.id.in_(tag_ids_filter))
        ids_stmt = ids_stmt.where(
            (Item.title.like(qq)) |
            (Item.series_name_snapshot.like(qq)) |
            (ItemVersion.prompt_blob.like(qq)) |
            (Tag.name.like(qq))
        )
        ids_stmt = ids_stmt.order_by(Item.created_at.desc()).offset((page - 1) * page_size).limit(page_size)

        page_ids = _normalize_scalar_ids(session.exec(ids_stmt).all())

        if not page_ids:
            return PageDTO(items=[], page=page, page_size=page_size, total=total_fb)

        rows = session.exec(select(Item).where(Item.id.in_(page_ids))).all()
        by_id = {r.id: r for r in rows}
        ordered = [by_id[i] for i in page_ids if i in by_id]

        return PageDTO(
            items=[_build_item_dto(session, it) for it in ordered],
            page=page,
            page_size=page_size,
            total=total_fb,
        )

    # ----------------------------
    # no q path
    # ----------------------------
    stmt = apply_filters(select(Item))
    if tag_ids_filter is not None:
        stmt = stmt.where(Item.id.in_(tag_ids_filter))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int(session.exec(count_stmt).one())

    stmt = stmt.order_by(Item.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = session.exec(stmt).all()

    return PageDTO(
        items=[_build_item_dto(session, it) for it in rows],
        page=page,
        page_size=page_size,
        total=total,
    )

def _item_lite(session: Session, it: Item, tool_label: str) -> DuplicateItemLiteDTO:
    def to_url(rel: str) -> str:
        relp = (rel or "").replace("\\", "/").lstrip("/")
        return f"/files/{relp}" if relp else ""

    root = Path(settings.storage_root).resolve()

    rel_media = (it.media_path or "").replace("\\", "/").lstrip("/")
    rel_thumb = (it.thumb_path or "").replace("\\", "/").lstrip("/")
    rel_poster = (it.poster_path or "").replace("\\", "/").lstrip("/") if it.poster_path else None

    p_media = (root / rel_media).resolve() if rel_media else None
    p_thumb = (root / rel_thumb).resolve() if rel_thumb else None
    p_poster = (root / rel_poster).resolve() if rel_poster else None

    media_exists = bool(p_media and p_media.exists())
    thumb_exists = bool(p_thumb and p_thumb.exists())
    poster_exists = (bool(p_poster and p_poster.exists()) if it.media_type == "video" and rel_poster else None)

    return DuplicateItemLiteDTO(
        id=it.id,
        title=it.title,
        media_type=it.media_type,
        thumb_url=to_url(it.thumb_path),
        media_url=to_url(it.media_path),
        tool_label=tool_label,
        created_at=it.created_at,
        is_deleted=bool(it.is_deleted),
        media_exists=media_exists,
        thumb_exists=thumb_exists,
        poster_exists=poster_exists,
    )


@router.get("/items/duplicates", response_model=DuplicatePageDTO)
def list_duplicates(
    session: Session = Depends(get_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    min_count: int = Query(2, ge=2, le=999),
    scope: str = Query("media_sha256"),  # media_sha256 | media_sha256_tool
    include_deleted: int = Query(0, ge=0, le=1),
    items_limit: int = Query(12, ge=1, le=50),
    q: Optional[str] = Query(None),  # optional sha prefix/substring filter
):
    scope = (scope or "media_sha256").strip().lower()
    if scope not in ("media_sha256", "media_sha256_tool"):
        raise_api_error(400, "INVALID_SCOPE", "scope must be media_sha256 or media_sha256_tool", {"scope": scope})

    # base filter
    base = select(Item).where(Item.media_sha256.is_not(None)).where(Item.media_sha256 != "")
    if not include_deleted:
        base = base.where(Item.is_deleted == False)
    if q and q.strip():
        qq = f"%{q.strip()}%"
        base = base.where(Item.media_sha256.like(qq))

    # group query
    sub = base.subquery()
    if scope == "media_sha256":
        g_stmt = (
            select(sub.c.media_sha256, func.count().label("cnt"))
            .group_by(sub.c.media_sha256)
            .having(func.count() >= min_count)
            .order_by(func.count().desc(), sub.c.media_sha256.asc())
        )
        # total groups
        total_stmt = select(func.count()).select_from(g_stmt.subquery())
        total_groups = int(session.exec(total_stmt).one())

        rows = session.exec(
            g_stmt.offset((page - 1) * page_size).limit(page_size)
        ).all()

        # fetch items for each sha
        groups: list[DuplicateGroupDTO] = []
        for sha, cnt in rows:
            if not sha:
                continue
            it_stmt = select(Item).where(Item.media_sha256 == sha)
            if not include_deleted:
                it_stmt = it_stmt.where(Item.is_deleted == False)

            items = session.exec(
                it_stmt.order_by(Item.created_at.desc()).limit(items_limit)
            ).all()

            # tool labels
            tool_ids = sorted({it.tool_id for it in items})
            tool_map = {t.id: t.label for t in session.exec(select(Tool).where(Tool.id.in_(tool_ids))).all()} if tool_ids else {}

            groups.append(
                DuplicateGroupDTO(
                    key=sha,
                    media_sha256=sha,
                    tool_id=None,
                    tool_label=None,
                    count=int(cnt),
                    items=[_item_lite(session, it, tool_map.get(it.tool_id, it.tool_id)) for it in items],
                )
            )

        return DuplicatePageDTO(page=page, page_size=page_size, total_groups=total_groups, groups=groups)

    # scope == media_sha256_tool
    g_stmt = (
        select(sub.c.media_sha256, sub.c.tool_id, func.count().label("cnt"))
        .group_by(sub.c.media_sha256, sub.c.tool_id)
        .having(func.count() >= min_count)
        .order_by(func.count().desc(), sub.c.media_sha256.asc(), sub.c.tool_id.asc())
    )
    total_stmt = select(func.count()).select_from(g_stmt.subquery())
    total_groups = int(session.exec(total_stmt).one())

    rows = session.exec(
        g_stmt.offset((page - 1) * page_size).limit(page_size)
    ).all()

    groups: list[DuplicateGroupDTO] = []
    for sha, tool_id, cnt in rows:
        if not sha or not tool_id:
            continue
        it_stmt = select(Item).where(Item.media_sha256 == sha, Item.tool_id == tool_id)
        if not include_deleted:
            it_stmt = it_stmt.where(Item.is_deleted == False)

        items = session.exec(
            it_stmt.order_by(Item.created_at.desc()).limit(items_limit)
        ).all()

        tool = session.get(Tool, tool_id)
        tool_label = tool.label if tool else tool_id

        groups.append(
            DuplicateGroupDTO(
                key=f"{sha}|{tool_id}",
                media_sha256=sha,
                tool_id=tool_id,
                tool_label=tool_label,
                count=int(cnt),
                items=[_item_lite(session, it, tool_label) for it in items],
            )
        )

    return DuplicatePageDTO(page=page, page_size=page_size, total_groups=total_groups, groups=groups)


@router.get("/items/{item_id}", response_model=ItemDTO)
def get_item(item_id: str, session: Session = Depends(get_session)):
    it = session.get(Item, item_id)
    if not it:
        raise_api_error(404, "NOT_FOUND", "Item not found", {"item_id": item_id})
    return _build_item_dto(session, it)


@router.patch("/items/{item_id}", response_model=ItemDTO)
def patch_item(item_id: str, patch: ItemPatch, session: Session = Depends(get_session)):
    it = session.get(Item, item_id)
    if not it:
        raise_api_error(404, "NOT_FOUND", "Item not found", {"item_id": item_id})

    now = datetime.utcnow()

    if patch.title is not None:
        it.title = normalize_text(patch.title)

    if patch.series_id is not None:
        if patch.series_id == "":
            it.series_id = None
            it.series_name_snapshot = None
            it.delimiter_snapshot = None
        else:
            s = session.get(Series, patch.series_id)
            if not s:
                raise_api_error(400, "SERIES_NOT_FOUND", "Series not found", {"series_id": patch.series_id})
            it.series_id = s.id
            it.series_name_snapshot = s.name
            it.delimiter_snapshot = s.delimiter

    if patch.category_id is not None:
        c = session.get(Category, patch.category_id)
        if not c:
            raise_api_error(400, "CATEGORY_NOT_FOUND", "Category not found", {"category_id": patch.category_id})
        it.category_id = c.id

    if patch.tags is not None:
        _set_item_tags_replace_all(session, it.id, normalize_list(patch.tags))

    it.updated_at = now
    session.add(it)
    session.commit()
    session.refresh(it)
    fts_upsert_item(session, it.id)
    return _build_item_dto(session, it)

@router.delete("/items/{item_id}")
def soft_delete_item(item_id: str, session: Session = Depends(get_session)):
    it = session.get(Item, item_id)
    if not it:
        raise_api_error(404, "NOT_FOUND", "Item not found", {"item_id": item_id})
    if it.is_deleted:
        return {"status": "ok", "already_deleted": True}

    it.is_deleted = True
    it.deleted_at = datetime.utcnow()
    it.updated_at = datetime.utcnow()

    session.add(it)
    session.commit()

    # remove from FTS so normal search doesn't match it (when include_deleted=0)
    try:
        fts_delete_item(session, item_id)
    except Exception:
        pass

    return {"status": "ok", "deleted": True}


@router.post("/items/{item_id}/restore")
def restore_item(item_id: str, session: Session = Depends(get_session)):
    it = session.get(Item, item_id)
    if not it:
        raise_api_error(404, "NOT_FOUND", "Item not found", {"item_id": item_id})
    if not it.is_deleted:
        return {"status": "ok", "already_active": True}

    it.is_deleted = False
    it.deleted_at = None
    it.updated_at = datetime.utcnow()

    session.add(it)
    session.commit()

    # re-index into FTS
    try:
        fts_upsert_item(session, item_id)
    except Exception:
        pass

    return {"status": "ok", "restored": True}




@router.get("/items/{item_id}/versions", response_model=list[ItemVersionDTO])
def list_item_versions(item_id: str, session: Session = Depends(get_session)):
    it = session.get(Item, item_id)
    if not it:
        raise_api_error(404, "NOT_FOUND", "Item not found", {"item_id": item_id})
    rows = session.exec(
        select(ItemVersion).where(ItemVersion.item_id == item_id).order_by(ItemVersion.v.desc())
    ).all()
    return [ItemVersionDTO.model_validate(r) for r in rows]


@router.post("/items/{item_id}/versions", response_model=ItemDTO)
def create_item_version(item_id: str, body: ItemVersionCreate, session: Session = Depends(get_session)):
    it = session.get(Item, item_id)
    if not it:
        raise_api_error(404, "NOT_FOUND", "Item not found", {"item_id": item_id})

    last = session.exec(
        select(ItemVersion).where(ItemVersion.item_id == item_id).order_by(ItemVersion.v.desc())
    ).first()
    next_v = (last.v + 1) if last else 1

    vid = new_id()
    now = datetime.utcnow()
    v = ItemVersion(
        id=vid,
        item_id=item_id,
        v=next_v,
        prompt_blob=normalize_text(body.prompt_blob),  # store exactly
        note=normalize_text(body.note) if body.note else None,
        created_at=now,
    )

    it.current_version_id = vid
    it.updated_at = now

    session.add(v)
    session.add(it)
    session.commit()
    session.refresh(it)
    fts_upsert_item(session, it.id)
    return _build_item_dto(session, it)


@router.post("/items", response_model=ItemDTO)
async def create_item(
    request: Request,
    file: UploadFile = File(...),
    meta: str = Form(...),
    session: Session = Depends(get_session),
):
    # Parse meta JSON
    try:
        meta_obj = ItemCreateMeta.model_validate(json.loads(meta))
        meta_obj.title = normalize_text(meta_obj.title)
        meta_obj.prompt_blob = normalize_text(meta_obj.prompt_blob)
        meta_obj.tags = normalize_list(meta_obj.tags)
    except Exception as e:
        raise_api_error(400, "INVALID_META", f"Invalid meta JSON: {e}")

    # Resolve tool
    tool: Optional[Tool] = None
    if meta_obj.tool_id:
        tool = session.get(Tool, meta_obj.tool_id)
    elif meta_obj.tool_key:
        tool = session.exec(select(Tool).where(Tool.key == meta_obj.tool_key)).first()

    if not tool:
        raise_api_error(400, "TOOL_NOT_FOUND", "Tool not found (provide tool_id or tool_key)", {
            "tool_id": meta_obj.tool_id, "tool_key": meta_obj.tool_key
        })

    # Resolve optional series snapshots
    series = None
    if meta_obj.series_id:
        series = session.get(Series, meta_obj.series_id)
        if not series:
            raise_api_error(400, "SERIES_NOT_FOUND", "Series not found", {"series_id": meta_obj.series_id})

    # Resolve optional manual category
    manual_category = None
    is_category_locked = False
    if meta_obj.category_id:
        manual_category = session.get(Category, meta_obj.category_id)
        if not manual_category:
            raise_api_error(400, "CATEGORY_NOT_FOUND", "Category not found", {"category_id": meta_obj.category_id})
        is_category_locked = True

    # Determine media type & ext
    try:
        media_type, ext = _guess_media_type(file, file.filename or "upload")
    except Exception as e:
        raise_api_error(400, "UNSUPPORTED_MEDIA", str(e))

    # IDs & paths
    item_id = new_id()
    v1_id = new_id()

    now = datetime.utcnow()
    yyyy = f"{now.year:04d}"
    mm = f"{now.month:02d}"

    rel_media = Path("media") / yyyy / mm / f"{item_id}{ext}"
    rel_thumb = Path("thumb") / yyyy / mm / f"{item_id}.jpg"
    rel_poster = Path("poster") / yyyy / mm / f"{item_id}.jpg" if media_type == "video" else None

    abs_media = settings.storage_root / rel_media
    abs_thumb = settings.storage_root / rel_thumb
    abs_poster = (settings.storage_root / rel_poster) if rel_poster else None

    # Save upload to disk
    try:
        _, sha256_hex = await save_uploadfile_streaming(file, abs_media, compute_sha256=True)
    except ValueError as e:
        raise_api_error(413, "FILE_TOO_LARGE", str(e))
    except Exception as e:
        # cleanup best-effort
        safe_unlink(abs_media)
        raise_api_error(500, "SAVE_FAILED", f"Failed to save file: {e}")

    try:
        # Generate thumb/poster
        if media_type == "image":
            make_image_thumb(abs_media, abs_thumb, max_w=768)
            embed_src = abs_media
        else:
            if not abs_poster:
                raise RuntimeError("poster path missing")
            make_video_poster(abs_media, abs_poster, ss=0.5)
            if abs_poster.exists():
                make_image_thumb(abs_poster, abs_thumb, max_w=768)
                embed_src = abs_poster
            else:
                # ffmpeg failed or not installed.
                # Skip thumb generation from poster.
                # Embedding will fail if we pass None or non-existent path.
                # We can try to use a placeholder or better yet, handle 'embed_src' being None gracefully below.
                embed_src = None

        # Determine initial category_id and auto_category_id
        # If manual category is provided, use it; otherwise will be set after auto-classification
        if manual_category:
            # Manual category selected: use it as final category
            category_id = manual_category.id
            # Still run auto-classification for reference (auto_category_id and candidates)
            # But don't override category_id
        else:
            # No manual category: will use auto-classification result
            category_id = None

        # Write DB rows in a transaction
        # v1
        session.add(ItemVersion(
            id=v1_id,
            item_id=item_id,
            v=1,
            prompt_blob=meta_obj.prompt_blob,
            note="initial",
            created_at=now,
        ))

        # tags
        tag_ids = _upsert_tags(session, meta_obj.tags)

        # item (initial create with placeholder category if needed)
        # We'll update category after auto-classification if not manually set
        if not category_id:
            # Need a placeholder category for now, will update after auto-classification
            unc = session.exec(select(Category).where(Category.name == "未分类")).first()
            if not unc:
                # Last resort: pick first category
                any_cat = session.exec(select(Category)).first()
                if not any_cat:
                    raise_api_error(500, "NO_CATEGORY", "No categories available in database")
                category_id = any_cat.id
            else:
                category_id = unc.id

        it = Item(
            id=item_id,
            title=meta_obj.title,
            series_id=(series.id if series else None),
            series_name_snapshot=(series.name if series else None),
            delimiter_snapshot=(series.delimiter if series else None),
            tool_id=tool.id,
            media_type=media_type,
            media_path=_posix_rel(rel_media),
            thumb_path=_posix_rel(rel_thumb),
            poster_path=_posix_rel(rel_poster) if rel_poster else None,
            category_id=category_id,
            auto_category_id=None,  # Will be set after auto-classification
            auto_confidence=None,
            is_category_locked=is_category_locked,
            current_version_id=v1_id,
            created_at=now,
            updated_at=now,
            media_sha256=sha256_hex,
        )
        session.add(it)

        for tid in tag_ids:
            session.add(ItemTag(item_id=item_id, tag_id=tid, created_at=now))

        session.commit()

        # Generate embedding first (needed for classify_item)
        if embed_src and embed_src.exists():
            classify_and_store_item_embedding(session, item_id=item_id, image_or_poster_path=embed_src)

        # Run auto-classification to get candidates and auto_category_id
        # This always runs for reference, even if manual category is set
        unc, best, top = classify_item(
            session,
            it.id,
            topk=settings.auto_cat_topk,
            threshold=settings.auto_cat_threshold,
            include_deleted_for_prototypes=True,
        )

        # Update auto_* fields (always)
        it.auto_candidates_json = serialize_candidates(top) if top else None
        it.auto_category_id = best.category_id if best else None
        it.auto_confidence = best.score if best else None

        # Update final category_id only if NOT manually locked
        if not is_category_locked:
            # Threshold gate: if best score is low, fall back to "Uncategorized"
            if best and best.score >= settings.auto_cat_threshold:
                it.category_id = best.category_id
            else:
                it.category_id = unc.id

        it.updated_at = datetime.utcnow()
        session.add(it)
        session.commit()

        # Final index and DTO
        fts_upsert_item(session, item_id)
        return _build_item_dto(session, it)

    except Exception as e:
        # Cleanup files if any post-processing failed
        safe_unlink(abs_media)
        safe_unlink(abs_thumb)
        safe_unlink(abs_poster)
        # Re-raise as API error if not already
        if hasattr(e, "status_code"):
            raise
        raise_api_error(500, "UPLOAD_PIPELINE_FAILED", f"{e}")

@router.post("/items/bulk_patch")
def bulk_patch_items(body: ItemsBulkPatch, session: Session = Depends(get_session)):
    # guard
    item_ids = list(dict.fromkeys([x for x in body.item_ids if x]))
    if not item_ids:
        raise_api_error(400, "EMPTY_IDS", "item_ids is empty")

    # validate category if provided
    if body.category_id is not None:
        c = session.get(Category, body.category_id)
        if not c:
            raise_api_error(400, "CATEGORY_NOT_FOUND", "Category not found", {"category_id": body.category_id})

    # validate series if provided ("" means clear)
    series_obj = None
    if body.series_id is not None and body.series_id != "":
        series_obj = session.get(Series, body.series_id)
        if not series_obj:
            raise_api_error(400, "SERIES_NOT_FOUND", "Series not found", {"series_id": body.series_id})

    tags_set = normalize_list(body.tags_set or []) if body.tags_set is not None else None
    tags_add = normalize_list(body.tags_add or [])
    tags_remove = normalize_list(body.tags_remove or [])

    now = datetime.utcnow()
    updated = 0
    missing = []

    try:
        for iid in item_ids:
            it = session.get(Item, iid)
            if not it:
                missing.append(iid)
                continue

            # apply category
            if body.category_id is not None:
                it.category_id = body.category_id

            # apply series
            if body.series_id is not None:
                if body.series_id == "":
                    it.series_id = None
                    it.series_name_snapshot = None
                    it.delimiter_snapshot = None
                else:
                    it.series_id = series_obj.id
                    it.series_name_snapshot = series_obj.name
                    it.delimiter_snapshot = series_obj.delimiter

            # apply tags
            if tags_set is not None:
                _set_item_tags_replace_all(session, it.id, tags_set)
            else:
                if tags_add or tags_remove:
                    cur = set(_load_item_tags(session, it.id))
                    cur |= set(tags_add)
                    cur -= set(tags_remove)
                    _set_item_tags_replace_all(session, it.id, sorted(cur))

            it.updated_at = now
            session.add(it)
            updated += 1

        session.commit()

        # refresh fts best-effort (safe no-op if FTS missing)
        for iid in item_ids:
            try:
                fts_upsert_item(session, iid)
            except Exception:
                pass

        return {"status": "ok", "requested": len(item_ids), "updated": updated, "missing_item_ids": missing}

    except Exception as e:
        session.rollback()
        raise_api_error(500, "BULK_PATCH_FAILED", f"Bulk patch failed: {str(e)[:300]}")

@router.post("/items/bulk_trash")
def bulk_trash(body: ItemsBulkIds, session: Session = Depends(get_session)):
    ids = list(dict.fromkeys([x for x in body.item_ids if x]))
    now = datetime.utcnow()
    updated = 0

    try:
        for iid in ids:
            it = session.get(Item, iid)
            if not it or it.is_deleted:
                continue
            it.is_deleted = True
            it.deleted_at = now
            it.updated_at = now
            session.add(it)
            updated += 1
        session.commit()

        for iid in ids:
            try: fts_delete_item(session, iid)
            except Exception: pass

        return {"status": "ok", "requested": len(ids), "trashed": updated}
    except Exception as e:
        session.rollback()
        raise_api_error(500, "BULK_TRASH_FAILED", f"{str(e)[:300]}")


@router.post("/items/bulk_restore")
def bulk_restore(body: ItemsBulkIds, session: Session = Depends(get_session)):
    ids = list(dict.fromkeys([x for x in body.item_ids if x]))
    now = datetime.utcnow()
    updated = 0

    try:
        for iid in ids:
            it = session.get(Item, iid)
            if not it or not it.is_deleted:
                continue
            it.is_deleted = False
            it.deleted_at = None
            it.updated_at = now
            session.add(it)
            updated += 1
        session.commit()

        for iid in ids:
            try: fts_upsert_item(session, iid)
            except Exception: pass

        return {"status": "ok", "requested": len(ids), "restored": updated}
    except Exception as e:
        session.rollback()
        raise_api_error(500, "BULK_RESTORE_FAILED", f"{str(e)[:300]}")


@router.post("/items/bulk_purge")
def bulk_purge(body: ItemsBulkPurgeRequest, session: Session = Depends(get_session)):
    if body.confirm != "PURGE":
        raise_api_error(400, "CONFIRM_REQUIRED", 'confirm must be exactly "PURGE"')

    ids = list(dict.fromkeys([x for x in body.item_ids if x]))
    if not ids:
        raise_api_error(400, "EMPTY_IDS", "item_ids is empty")

    storage_root = Path(settings.storage_root).resolve()

    deleted_items = 0
    deleted_versions = 0
    deleted_tags = 0
    deleted_embeddings = 0
    deleted_files = 0
    missing_files = 0
    missing_items: list[str] = []
    not_deleted_items: list[str] = []
    errors: list[dict] = []

    for iid in ids:
        it = session.get(Item, iid)
        if not it:
            missing_items.append(iid)
            continue
        if not it.is_deleted:
            # safety: only allow purging soft-deleted items
            not_deleted_items.append(iid)
            continue

        # compute abs paths before deleting row
        rel_media = (it.media_path or "").replace("\\", "/").lstrip("/")
        rel_thumb = (it.thumb_path or "").replace("\\", "/").lstrip("/")
        rel_poster = (it.poster_path or "").replace("\\", "/").lstrip("/") if it.poster_path else None

        abs_media = (storage_root / rel_media).resolve() if rel_media else None
        abs_thumb = (storage_root / rel_thumb).resolve() if rel_thumb else None
        abs_poster = (storage_root / rel_poster).resolve() if rel_poster else None

        try:
            # DB delete (explicit, do not rely on cascade)
            emb = session.exec(select(ItemEmbedding).where(ItemEmbedding.item_id == iid)).all()
            for r in emb:
                session.delete(r)
            deleted_embeddings += len(emb)

            links = session.exec(select(ItemTag).where(ItemTag.item_id == iid)).all()
            for r in links:
                session.delete(r)
            deleted_tags += len(links)

            vers = session.exec(select(ItemVersion).where(ItemVersion.item_id == iid)).all()
            for r in vers:
                session.delete(r)
            deleted_versions += len(vers)

            session.delete(it)
            session.commit()
            deleted_items += 1

            # remove from FTS best-effort
            try:
                fts_delete_item(session, iid)
            except Exception:
                pass

            # file purge after DB commit
            if body.purge_files:
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
                        errors.append({"item_id": iid, "stage": "delete_file", "path": str(p), "err": str(e)[:300]})

        except Exception as e:
            session.rollback()
            errors.append({"item_id": iid, "stage": "db_delete", "err": str(e)[:400]})

    return {
        "status": "ok",
        "requested": len(ids),
        "deleted": {
            "items": deleted_items,
            "item_versions": deleted_versions,
            "item_tags": deleted_tags,
            "item_embeddings": deleted_embeddings,
            "files_deleted": deleted_files,
            "files_missing": missing_files,
        },
        "skipped": {
            "missing_items": missing_items,
            "not_deleted_items": not_deleted_items,
        },
        "errors_sample": errors[:20],
    }
