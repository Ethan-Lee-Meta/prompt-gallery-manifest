"""soft delete series

Revision ID: 20260110_02
Revises: 20260110_01
Create Date: 2026-01-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260110_02"
down_revision = "20260110_01_add_is_category_locked"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite: ALTER TABLE ADD COLUMN is supported
    op.add_column("series", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")))
    op.add_column("series", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    op.create_index("ix_series_is_deleted", "series", ["is_deleted"], unique=False)
    op.create_index("ix_series_deleted_at", "series", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_series_deleted_at", table_name="series")
    op.drop_index("ix_series_is_deleted", table_name="series")
    # SQLite cannot drop columns easily; keep downgrade as no-op for columns
