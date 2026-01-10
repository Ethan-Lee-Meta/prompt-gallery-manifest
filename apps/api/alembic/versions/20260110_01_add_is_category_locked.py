"""add is_category_locked to items

Revision ID: 20260110_01_add_is_category_locked
Revises: 20260109_09_add_updated_at_to_tools
Create Date: 2026-01-10 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision = '20260110_01_add_is_category_locked'
down_revision = '20260109_10'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('items', sa.Column('is_category_locked', sa.Boolean(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('items', 'is_category_locked')
