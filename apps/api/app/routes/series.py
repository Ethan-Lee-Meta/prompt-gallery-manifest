from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import Series, SeriesVersion, Tag, SeriesTag, Item
from app.schemas import (
    SeriesDTO, SeriesCreate, SeriesPatch,
    SeriesVersionDTO, SeriesVersionCreate,
    SeriesPurgeRequest, SeriesPurgeDeletedRequest,
)
from app.util.ids import new_id
from app.util.errors import raise_api_error
from app.util.text import normalize_text, normalize_list

router = APIRouter()


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


def _set_series_tags_replace_all(session: Session, series_id: str, tag_names: list[str]) -> list[str]:
    links = session.exec(select(SeriesTag).where(SeriesTag.series_id == series_id)).all()
    for lk in links:
        session.delete(lk)

    tag_ids = _upsert_tags(session, tag_names)
    now = datetime.utcnow()
    for tid in tag_ids:
        session.add(SeriesTag(series_id=series_id, tag_id=tid, created_at=now))
    return tag_ids


def _load_series_tags(session: Session, series_id: str) -> list[str]:
    tag_ids = [r.tag_id for r in session.exec(select(SeriesTag).where(SeriesTag.series_id == series_id)).all()]
    if not tag_ids:
        return []
    tags = session.exec(select(Tag).where(Tag.id.in_(tag_ids))).all()
    # preserve input order loosely by name
    return sorted([t.name for t in tags])


def _build_series_dto(session: Session, s: Series) -> SeriesDTO:
    v: Optional[SeriesVersion] = None
    if s.current_version_id:
        v = session.get(SeriesVersion, s.current_version_id)
    if not v:
        v = session.exec(
            select(SeriesVersion).where(SeriesVersion.series_id == s.id).order_by(SeriesVersion.v.desc())
        ).first()
    if not v:
        raise RuntimeError("series.version not found")

    tags = _load_series_tags(session, s.id)

    return SeriesDTO(
        id=s.id,
        name=s.name,
        delimiter=s.delimiter,
        tags=tags,
        current_version=SeriesVersionDTO.model_validate(v),
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


def _purge_series(session: Session, s: Series) -> dict:
    items = session.exec(select(Item).where(Item.series_id == s.id)).all()
    for it in items:
        it.series_id = None
        it.series_name_snapshot = None
        it.delimiter_snapshot = None
        it.updated_at = datetime.utcnow()
        session.add(it)

    tags = session.exec(select(SeriesTag).where(SeriesTag.series_id == s.id)).all()
    for lk in tags:
        session.delete(lk)

    versions = session.exec(select(SeriesVersion).where(SeriesVersion.series_id == s.id)).all()
    for v in versions:
        session.delete(v)

    session.delete(s)
    return {
        "items_detached": len(items),
        "versions_deleted": len(versions),
        "tags_deleted": len(tags),
    }


@router.get("/series", response_model=list[SeriesDTO])
def list_series(
    session: Session = Depends(get_session),
    q: Optional[str] = Query(None),
    include_deleted: int = Query(0, ge=0, le=1),
    only_deleted: int = Query(0, ge=0, le=1),
):
    stmt = select(Series).order_by(Series.updated_at.desc())
    if q:
        qq = f"%{q.strip()}%"
        stmt = stmt.where(Series.name.like(qq))
    if not include_deleted:
        stmt = stmt.where(Series.is_deleted == False)
    elif only_deleted:
        stmt = stmt.where(Series.is_deleted == True)
    rows = session.exec(stmt).all()
    return [_build_series_dto(session, s) for s in rows]


@router.get("/series/{series_id}", response_model=SeriesDTO)
def get_series(series_id: str, session: Session = Depends(get_session)):
    s = session.get(Series, series_id)
    if not s:
        raise_api_error(404, "NOT_FOUND", "Series not found", {"series_id": series_id})
    return _build_series_dto(session, s)


@router.post("/series", response_model=SeriesDTO)
def create_series(body: SeriesCreate, session: Session = Depends(get_session)):
    now = datetime.utcnow()

    # pre-check unique
    exists = session.exec(select(Series).where(Series.name == body.name)).first()
    if exists:
        raise_api_error(400, "SERIES_NAME_EXISTS", "Series name already exists", {"name": body.name})

    sid = new_id()
    vid = new_id()

    try:
        s = Series(
            id=sid,
            name=body.name,
            delimiter=body.delimiter or "｜",
            current_version_id=vid,
            created_at=now,
            updated_at=now,
        )
        session.add(s)

        v = SeriesVersion(
            id=vid,
            series_id=sid,
            v=1,
            base_prompt_blob=body.base_prompt_blob,
            note="initial",
            created_at=now,
        )
        session.add(v)

        _set_series_tags_replace_all(session, sid, body.tags)

        session.commit()
        session.refresh(s)
        return _build_series_dto(session, s)

    except Exception as e:
        session.rollback()
        raise_api_error(500, "DB_WRITE_FAILED", f"Failed to create series: {str(e)[:300]}")


@router.patch("/series/{series_id}", response_model=SeriesDTO)
def patch_series(series_id: str, patch: SeriesPatch, session: Session = Depends(get_session)):
    s = session.get(Series, series_id)
    if not s:
        raise_api_error(404, "NOT_FOUND", "Series not found", {"series_id": series_id})

    now = datetime.utcnow()

    if patch.name is not None:
        patch.name = normalize_text(patch.name)
        # avoid name collision
        other = session.exec(select(Series).where(Series.name == patch.name, Series.id != series_id)).first()
        if other:
            raise_api_error(400, "SERIES_NAME_EXISTS", "Series name already exists", {"name": patch.name})
        s.name = patch.name

    if patch.delimiter is not None:
        s.delimiter = normalize_text(patch.delimiter) or "｜"

    if patch.tags is not None:
        _set_series_tags_replace_all(session, s.id, normalize_list(patch.tags))

    s.updated_at = now
    session.add(s)
    session.commit()
    session.refresh(s)
    return _build_series_dto(session, s)


@router.delete("/series/{series_id}")
def soft_delete_series(series_id: str, session: Session = Depends(get_session)):
    s = session.get(Series, series_id)
    if not s:
        raise_api_error(404, "NOT_FOUND", "Series not found", {"series_id": series_id})
    if s.is_deleted:
        return {"status": "ok", "already_deleted": True}

    s.is_deleted = True
    s.deleted_at = datetime.utcnow()
    s.updated_at = datetime.utcnow()
    session.add(s)
    session.commit()
    return {"status": "ok", "deleted": True}


@router.post("/series/{series_id}/restore")
def restore_series(series_id: str, session: Session = Depends(get_session)):
    s = session.get(Series, series_id)
    if not s:
        raise_api_error(404, "NOT_FOUND", "Series not found", {"series_id": series_id})
    if not s.is_deleted:
        return {"status": "ok", "already_active": True}

    s.is_deleted = False
    s.deleted_at = None
    s.updated_at = datetime.utcnow()
    session.add(s)
    session.commit()
    return {"status": "ok", "restored": True}


@router.post("/series/{series_id}/purge")
def purge_series(series_id: str, body: SeriesPurgeRequest, session: Session = Depends(get_session)):
    if body.confirm != "PURGE":
        raise_api_error(400, "CONFIRM_REQUIRED", 'confirm must be "PURGE"')
    s = session.get(Series, series_id)
    if not s:
        raise_api_error(404, "NOT_FOUND", "Series not found", {"series_id": series_id})
    if not s.is_deleted:
        raise_api_error(400, "NOT_DELETED", "Series must be in trash before purge", {"series_id": series_id})

    try:
        stats = _purge_series(session, s)
        session.commit()
        return {"status": "ok", "deleted": stats}
    except Exception as e:
        session.rollback()
        raise_api_error(500, "DB_WRITE_FAILED", f"Failed to purge series: {str(e)[:300]}")


@router.post("/series/purge_deleted")
def purge_deleted_series(body: SeriesPurgeDeletedRequest, session: Session = Depends(get_session)):
    if body.confirm != "PURGE":
        raise_api_error(400, "CONFIRM_REQUIRED", 'confirm must be "PURGE"')
    rows = session.exec(
        select(Series).where(Series.is_deleted == True).order_by(Series.updated_at.desc()).limit(body.limit)
    ).all()
    if not rows:
        return {"status": "ok", "deleted": {"series": 0, "items_detached": 0, "versions_deleted": 0, "tags_deleted": 0}}

    totals = {"series": 0, "items_detached": 0, "versions_deleted": 0, "tags_deleted": 0}
    try:
        for s in rows:
            stats = _purge_series(session, s)
            totals["series"] += 1
            totals["items_detached"] += stats["items_detached"]
            totals["versions_deleted"] += stats["versions_deleted"]
            totals["tags_deleted"] += stats["tags_deleted"]
        session.commit()
        return {"status": "ok", "deleted": totals}
    except Exception as e:
        session.rollback()
        raise_api_error(500, "DB_WRITE_FAILED", f"Failed to purge deleted series: {str(e)[:300]}")


@router.get("/series/{series_id}/versions", response_model=list[SeriesVersionDTO])
def list_series_versions(series_id: str, session: Session = Depends(get_session)):
    s = session.get(Series, series_id)
    if not s:
        raise_api_error(404, "NOT_FOUND", "Series not found", {"series_id": series_id})

    rows = session.exec(
        select(SeriesVersion).where(SeriesVersion.series_id == series_id).order_by(SeriesVersion.v.desc())
    ).all()
    return [SeriesVersionDTO.model_validate(r) for r in rows]


@router.post("/series/{series_id}/versions", response_model=SeriesDTO)
def create_series_version(series_id: str, body: SeriesVersionCreate, session: Session = Depends(get_session)):
    s = session.get(Series, series_id)
    if not s:
        raise_api_error(404, "NOT_FOUND", "Series not found", {"series_id": series_id})

    last = session.exec(
        select(SeriesVersion).where(SeriesVersion.series_id == series_id).order_by(SeriesVersion.v.desc())
    ).first()
    next_v = (last.v + 1) if last else 1

    now = datetime.utcnow()
    vid = new_id()

    try:
        v = SeriesVersion(
            id=vid,
            series_id=series_id,
            v=next_v,
            base_prompt_blob=body.base_prompt_blob,
            note=body.note,
            created_at=now,
        )
        session.add(v)

        s.current_version_id = vid
        s.updated_at = now
        session.add(s)

        session.commit()
        session.refresh(s)
        return _build_series_dto(session, s)

    except Exception as e:
        session.rollback()
        raise_api_error(500, "DB_WRITE_FAILED", f"Failed to create series version: {str(e)[:300]}")
