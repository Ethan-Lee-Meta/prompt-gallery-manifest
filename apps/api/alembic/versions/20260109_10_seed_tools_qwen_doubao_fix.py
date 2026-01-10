"""seed tools qwen/doubao (idempotent)

Revision ID: 20260109_08
Revises: 20260109_07
Create Date: 2026-01-09
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text
from datetime import datetime
import uuid

revision = "20260109_10"
down_revision = "20260109_09"
branch_labels = None
depends_on = None


def _upsert_tool(bind, key: str, label: str):
    now = datetime.utcnow().isoformat()
    row = bind.execute(text("SELECT id FROM tools WHERE key=:k"), {"k": key}).fetchone()
    if row:
        bind.execute(
            text("UPDATE tools SET label=:label, updated_at=:now WHERE key=:k"),
            {"k": key, "label": label, "now": now},
        )
    else:
        tid = uuid.uuid4().hex.upper()
        bind.execute(
            text("INSERT INTO tools (id, key, label, created_at, updated_at) VALUES (:id,:k,:label,:now,:now)"),
            {"id": tid, "k": key, "label": label, "now": now},
        )


def upgrade() -> None:
    bind = op.get_bind()
    _upsert_tool(bind, "qwen", "千问")
    _upsert_tool(bind, "doubao", "豆包")
    _upsert_tool(bind, "veo", "VEO")
    _upsert_tool(bind, "grok", "Grok")
    _upsert_tool(bind, "sora", "Sora")


def downgrade() -> None:
    # keep data
    pass
