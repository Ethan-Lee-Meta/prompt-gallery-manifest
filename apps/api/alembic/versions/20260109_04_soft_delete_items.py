"""soft delete items

Revision ID: 20260109_04
Revises: 20260108_03
Create Date: 2026-01-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260109_04"
down_revision = "20260108_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite: ALTER TABLE ADD COLUMN is supported
    op.add_column("items", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")))
    op.add_column("items", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    op.create_index("ix_items_is_deleted", "items", ["is_deleted"], unique=False)
    op.create_index("ix_items_deleted_at", "items", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_items_deleted_at", table_name="items")
    op.drop_index("ix_items_is_deleted", table_name="items")
    # SQLite cannot drop columns easily; keep downgrade as no-op for columns
