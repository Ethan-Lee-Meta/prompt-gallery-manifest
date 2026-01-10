"""add tools qwen and doubao

Revision ID: 20260109_07
Revises: 20260109_06
Create Date: 2026-01-09

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from datetime import datetime
import uuid


revision = "20260109_07"
down_revision = "20260109_06"
branch_labels = None
depends_on = None


def _id() -> str:
    return uuid.uuid4().hex.upper()


def upgrade() -> None:
    now = datetime.utcnow()
    conn = op.get_bind()

    tools = [
        ("qwen", "千问"),
        ("doubao", "豆包"),
        ("veo", "VEO"),
        ("grok", "Grok"),
        ("sora", "Sora"),
    ]

    for key, label in tools:
        exists = conn.execute(sa.text("SELECT 1 FROM tools WHERE key=:k"), {"k": key}).fetchone()
        if not exists:
            conn.execute(
                sa.text("INSERT INTO tools (id, key, label, created_at) VALUES (:id, :key, :label, :created_at)"),
                {"id": _id(), "key": key, "label": label, "created_at": now},
            )


def downgrade() -> None:
    conn = op.get_bind()
    for key in ("qwen", "doubao", "veo", "grok", "sora"):
        conn.execute(sa.text("DELETE FROM tools WHERE key=:k"), {"k": key})
