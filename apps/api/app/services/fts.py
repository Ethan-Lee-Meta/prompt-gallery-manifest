from __future__ import annotations

from typing import Optional, Tuple, List
from sqlalchemy import text
from sqlmodel import Session, select

from app.models import Item, ItemVersion, ItemTag, Tag


def _fts_phrase(q: str) -> str:
    q = (q or "").strip()
    q = q.replace('"', '""')
    return f"\"{q}\""


def _fts_available(session: Session) -> bool:
    try:
        row = session.exec(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='items_fts' LIMIT 1")
        ).first()
        return bool(row)
    except Exception:
        return False


def fts_upsert_item(session: Session, item_id: str) -> None:
    if not _fts_available(session):
        return

    it = session.get(Item, item_id)
    if not it:
        return

    v = None
    if it.current_version_id:
        v = session.get(ItemVersion, it.current_version_id)
    if not v:
        v = session.exec(
            select(ItemVersion).where(ItemVersion.item_id == it.id).order_by(ItemVersion.v.desc())
        ).first()

    prompt = v.prompt_blob if v else ""

    tag_ids = [r.tag_id for r in session.exec(select(ItemTag).where(ItemTag.item_id == it.id)).all()]
    tags = []
    if tag_ids:
        tags = [t.name for t in session.exec(select(Tag).where(Tag.id.in_(tag_ids))).all()]
    tags_text = " ".join(sorted(set(tags)))

    title = it.title or ""
    series = it.series_name_snapshot or ""

    try:
        session.exec(text("DELETE FROM items_fts WHERE item_id = :item_id"), {"item_id": it.id})
        session.exec(
            text(
                "INSERT INTO items_fts(item_id, title, series, prompt, tags) "
                "VALUES (:item_id, :title, :series, :prompt, :tags)"
            ),
            {"item_id": it.id, "title": title, "series": series, "prompt": prompt, "tags": tags_text},
        )
        session.commit()
    except Exception:
        # do not break core flows
        session.rollback()


def fts_delete_item(session: Session, item_id: str) -> None:
    if not _fts_available(session):
        return
    try:
        session.exec(text("DELETE FROM items_fts WHERE item_id = :item_id"), {"item_id": item_id})
        session.commit()
    except Exception:
        session.rollback()


def fts_rebuild_all(session: Session) -> int:
    if not _fts_available(session):
        return 0

    try:
        session.exec(text("DELETE FROM items_fts"))
        session.commit()
    except Exception:
        session.rollback()
        return 0

    raw = session.exec(select(Item.id)).all()
    ids = []
    for r in raw:
        if r is None:
            continue
        if isinstance(r, (tuple, list)):
            ids.append(r[0])
        else:
            ids.append(r)

    n = 0
    for iid in ids:
        fts_upsert_item(session, iid)
        n += 1
    return n


def fts_search_ids_join_items(
    session: Session,
    q: str,
    filters_sql: str,
    params: dict,
    limit: int,
    offset: int,
) -> Tuple[int, List[str]]:
    if not _fts_available(session):
        # no FTS => caller should fall back; return empty
        return 0, []

    match = _fts_phrase(q)

    base = (
        " FROM items "
        " JOIN items_fts ON items_fts.item_id = items.id "
        " WHERE items_fts MATCH :m "
    )
    if filters_sql:
        base += " AND " + filters_sql

    try:
        count_sql = "SELECT COUNT(*) " + base
        # .one() returns a Row (tuple-like), take first element
        total = session.exec(text(count_sql), {"m": match, **params}).one()[0]

        ids_sql = (
            "SELECT items.id "
            + base
            + " ORDER BY bm25(items_fts) ASC, items.created_at DESC "
            + " LIMIT :lim OFFSET :off"
        )
        rows = session.exec(text(ids_sql), {"m": match, **params, "lim": limit, "off": offset}).all()
        ids = [r[0] for r in rows]
        return int(total), ids
    except Exception:
        session.rollback()
        return 0, []
