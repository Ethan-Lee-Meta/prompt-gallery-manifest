"""add media_sha256 to items

Revision ID: 20260109_05
Revises: 20260109_04
Create Date: 2026-01-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260109_05"
down_revision = "20260109_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("items", sa.Column("media_sha256", sa.String(length=64), nullable=True))
    op.create_index("ix_items_media_sha256", "items", ["media_sha256"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_items_media_sha256", table_name="items")
    # SQLite drop column not supported; keep column
