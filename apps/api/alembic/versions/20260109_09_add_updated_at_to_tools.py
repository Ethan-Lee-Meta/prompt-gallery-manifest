"""add updated_at to tools table

Revision ID: 20260109_09
Revises: 20260109_08  
Create Date: 2026-01-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260109_09"
down_revision = "20260109_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add updated_at column to tools table
    op.add_column('tools', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('tools', 'updated_at')
