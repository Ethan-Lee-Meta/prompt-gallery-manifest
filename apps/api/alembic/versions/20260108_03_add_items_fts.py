"""add items_fts (fts5)

Revision ID: 20260108_03
Revises: 20260108_02
Create Date: 2026-01-08

"""
from __future__ import annotations

from alembic import op


revision = "20260108_03"
down_revision = "20260108_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Contentless FTS5 table; we manage sync in application code.
    op.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5("
        " item_id UNINDEXED,"
        " title,"
        " series,"
        " prompt,"
        " tags"
        ");"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS items_fts;")
