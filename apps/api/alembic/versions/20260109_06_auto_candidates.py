"""auto category candidates

Revision ID: 20260109_06
Revises: 20260109_05
Create Date: 2026-01-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "20260109_06"
down_revision = "20260109_05"
branch_labels = None
depends_on = None


def _has_col(bind, table: str, col: str) -> bool:
    rows = bind.execute(text(f"PRAGMA table_info({table})")).fetchall()
    cols = {r[1] for r in rows}  # (cid,name,type,notnull,dflt,pk)
    return col in cols


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_col(bind, "items", "auto_category_id"):
        op.add_column("items", sa.Column("auto_category_id", sa.String(length=32), nullable=True))
        op.create_index("ix_items_auto_category_id", "items", ["auto_category_id"], unique=False)

    if not _has_col(bind, "items", "auto_confidence"):
        op.add_column("items", sa.Column("auto_confidence", sa.Float(), nullable=True))
        op.create_index("ix_items_auto_confidence", "items", ["auto_confidence"], unique=False)

    if not _has_col(bind, "items", "auto_candidates_json"):
        op.add_column("items", sa.Column("auto_candidates_json", sa.Text(), nullable=True))


def downgrade() -> None:
    # SQLite: drop columns not supported; keep as no-op for columns.
    pass
