"""init schema

Revision ID: 20260108_01
Revises: 
Create Date: 2026-01-08

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260108_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # tools
    op.create_table(
        "tools",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("key", sa.String(length=128), nullable=False, unique=True, index=True),
        sa.Column("label", sa.String(length=256), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_tools_created_at", "tools", ["created_at"], unique=False)

    # categories
    op.create_table(
        "categories",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False, unique=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_categories_name", "categories", ["name"], unique=True)
    op.create_index("ix_categories_sort_order", "categories", ["sort_order"], unique=False)
    op.create_index("ix_categories_is_active", "categories", ["is_active"], unique=False)
    op.create_index("ix_categories_created_at", "categories", ["created_at"], unique=False)

    # tags
    op.create_table(
        "tags",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_tags_name", "tags", ["name"], unique=True)
    op.create_index("ix_tags_created_at", "tags", ["created_at"], unique=False)

    # series
    op.create_table(
        "series",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=256), nullable=False, unique=True),
        sa.Column("delimiter", sa.String(length=16), nullable=False, server_default="｜"),
        sa.Column("current_version_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_series_name", "series", ["name"], unique=True)
    op.create_index("ix_series_current_version_id", "series", ["current_version_id"], unique=False)
    op.create_index("ix_series_created_at", "series", ["created_at"], unique=False)
    op.create_index("ix_series_updated_at", "series", ["updated_at"], unique=False)

    # series_versions
    op.create_table(
        "series_versions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("series_id", sa.String(length=64), nullable=False),
        sa.Column("v", sa.Integer(), nullable=False),
        sa.Column("base_prompt_blob", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["series_id"], ["series.id"], name="fk_series_versions_series_id"),
        sa.UniqueConstraint("series_id", "v", name="uq_series_versions_series_v"),
    )
    op.create_index("ix_series_versions_series_id", "series_versions", ["series_id"], unique=False)
    op.create_index("ix_series_versions_v", "series_versions", ["v"], unique=False)
    op.create_index("ix_series_versions_created_at", "series_versions", ["created_at"], unique=False)

    # items
    op.create_table(
        "items",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("series_id", sa.String(length=64), nullable=True),
        sa.Column("series_name_snapshot", sa.Text(), nullable=True),
        sa.Column("delimiter_snapshot", sa.String(length=16), nullable=True),
        sa.Column("tool_id", sa.String(length=64), nullable=False),
        sa.Column("media_type", sa.String(length=16), nullable=False),
        sa.Column("media_path", sa.Text(), nullable=False),
        sa.Column("thumb_path", sa.Text(), nullable=False),
        sa.Column("poster_path", sa.Text(), nullable=True),
        sa.Column("category_id", sa.String(length=64), nullable=False),
        sa.Column("auto_category_id", sa.String(length=64), nullable=True),
        sa.Column("auto_confidence", sa.Float(), nullable=True),
        sa.Column("current_version_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["series_id"], ["series.id"], name="fk_items_series_id"),
        sa.ForeignKeyConstraint(["tool_id"], ["tools.id"], name="fk_items_tool_id"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], name="fk_items_category_id"),
        sa.ForeignKeyConstraint(["auto_category_id"], ["categories.id"], name="fk_items_auto_category_id"),
    )
    op.create_index("ix_items_title", "items", ["title"], unique=False)
    op.create_index("ix_items_series_id", "items", ["series_id"], unique=False)
    op.create_index("ix_items_tool_id", "items", ["tool_id"], unique=False)
    op.create_index("ix_items_media_type", "items", ["media_type"], unique=False)
    op.create_index("ix_items_category_id", "items", ["category_id"], unique=False)
    op.create_index("ix_items_auto_category_id", "items", ["auto_category_id"], unique=False)
    op.create_index("ix_items_created_at", "items", ["created_at"], unique=False)
    op.create_index("ix_items_updated_at", "items", ["updated_at"], unique=False)
    op.create_index("ix_items_created_at_id", "items", ["created_at", "id"], unique=False)
    op.create_index("ix_items_tool_media", "items", ["tool_id", "media_type"], unique=False)
    op.create_index("ix_items_series", "items", ["series_id"], unique=False)
    op.create_index("ix_items_category", "items", ["category_id"], unique=False)
    op.create_index("ix_items_current_version_id", "items", ["current_version_id"], unique=False)

    # item_versions
    op.create_table(
        "item_versions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("item_id", sa.String(length=64), nullable=False),
        sa.Column("v", sa.Integer(), nullable=False),
        sa.Column("prompt_blob", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], name="fk_item_versions_item_id"),
        sa.UniqueConstraint("item_id", "v", name="uq_item_versions_item_v"),
    )
    op.create_index("ix_item_versions_item_id", "item_versions", ["item_id"], unique=False)
    op.create_index("ix_item_versions_v", "item_versions", ["v"], unique=False)
    op.create_index("ix_item_versions_created_at", "item_versions", ["created_at"], unique=False)
    op.create_index("ix_item_versions_item_created", "item_versions", ["item_id", "created_at"], unique=False)

    # item_tags
    op.create_table(
        "item_tags",
        sa.Column("item_id", sa.String(length=64), primary_key=True),
        sa.Column("tag_id", sa.String(length=64), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], name="fk_item_tags_item_id"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], name="fk_item_tags_tag_id"),
    )
    op.create_index("ix_item_tags_created_at", "item_tags", ["created_at"], unique=False)

    # series_tags
    op.create_table(
        "series_tags",
        sa.Column("series_id", sa.String(length=64), primary_key=True),
        sa.Column("tag_id", sa.String(length=64), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["series_id"], ["series.id"], name="fk_series_tags_series_id"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], name="fk_series_tags_tag_id"),
    )
    op.create_index("ix_series_tags_created_at", "series_tags", ["created_at"], unique=False)

    # category_embeddings
    op.create_table(
        "category_embeddings",
        sa.Column("category_id", sa.String(length=64), primary_key=True),
        sa.Column("model_key", sa.String(length=128), primary_key=True),
        sa.Column("dim", sa.Integer(), nullable=False),
        sa.Column("vector_blob", sa.LargeBinary(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], name="fk_category_embeddings_category_id"),
    )
    op.create_index("ix_category_embeddings_dim", "category_embeddings", ["dim"], unique=False)
    op.create_index("ix_category_embeddings_updated_at", "category_embeddings", ["updated_at"], unique=False)

    # item_embeddings
    op.create_table(
        "item_embeddings",
        sa.Column("item_id", sa.String(length=64), primary_key=True),
        sa.Column("model_key", sa.String(length=128), primary_key=True),
        sa.Column("dim", sa.Integer(), nullable=False),
        sa.Column("vector_blob", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], name="fk_item_embeddings_item_id"),
    )
    op.create_index("ix_item_embeddings_dim", "item_embeddings", ["dim"], unique=False)
    op.create_index("ix_item_embeddings_created_at", "item_embeddings", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_item_embeddings_created_at", table_name="item_embeddings")
    op.drop_index("ix_item_embeddings_dim", table_name="item_embeddings")
    op.drop_table("item_embeddings")

    op.drop_index("ix_category_embeddings_updated_at", table_name="category_embeddings")
    op.drop_index("ix_category_embeddings_dim", table_name="category_embeddings")
    op.drop_table("category_embeddings")

    op.drop_index("ix_series_tags_created_at", table_name="series_tags")
    op.drop_table("series_tags")

    op.drop_index("ix_item_tags_created_at", table_name="item_tags")
    op.drop_table("item_tags")

    op.drop_index("ix_item_versions_item_created", table_name="item_versions")
    op.drop_index("ix_item_versions_created_at", table_name="item_versions")
    op.drop_index("ix_item_versions_v", table_name="item_versions")
    op.drop_index("ix_item_versions_item_id", table_name="item_versions")
    op.drop_table("item_versions")

    op.drop_index("ix_items_current_version_id", table_name="items")
    op.drop_index("ix_items_category", table_name="items")
    op.drop_index("ix_items_series", table_name="items")
    op.drop_index("ix_items_tool_media", table_name="items")
    op.drop_index("ix_items_created_at_id", table_name="items")
    op.drop_index("ix_items_updated_at", table_name="items")
    op.drop_index("ix_items_created_at", table_name="items")
    op.drop_index("ix_items_auto_category_id", table_name="items")
    op.drop_index("ix_items_category_id", table_name="items")
    op.drop_index("ix_items_media_type", table_name="items")
    op.drop_index("ix_items_tool_id", table_name="items")
    op.drop_index("ix_items_series_id", table_name="items")
    op.drop_index("ix_items_title", table_name="items")
    op.drop_table("items")

    op.drop_index("ix_series_versions_created_at", table_name="series_versions")
    op.drop_index("ix_series_versions_v", table_name="series_versions")
    op.drop_index("ix_series_versions_series_id", table_name="series_versions")
    op.drop_table("series_versions")

    op.drop_index("ix_series_updated_at", table_name="series")
    op.drop_index("ix_series_created_at", table_name="series")
    op.drop_index("ix_series_current_version_id", table_name="series")
    op.drop_index("ix_series_name", table_name="series")
    op.drop_table("series")

    op.drop_index("ix_tags_created_at", table_name="tags")
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_table("tags")

    op.drop_index("ix_categories_created_at", table_name="categories")
    op.drop_index("ix_categories_is_active", table_name="categories")
    op.drop_index("ix_categories_sort_order", table_name="categories")
    op.drop_index("ix_categories_name", table_name="categories")
    op.drop_table("categories")

    op.drop_index("ix_tools_created_at", table_name="tools")
    op.drop_table("tools")
