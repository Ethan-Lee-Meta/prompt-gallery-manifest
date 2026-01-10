"""seed categories and tools

Revision ID: 20260108_02
Revises: 20260108_01
Create Date: 2026-01-08

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from datetime import datetime
import uuid


revision = "20260108_02"
down_revision = "20260108_01"
branch_labels = None
depends_on = None


def _id() -> str:
    # deterministic enough for seed; use uuid4 hex upper
    return uuid.uuid4().hex.upper()


def upgrade() -> None:
    now = datetime.utcnow()

    conn = op.get_bind()

    # ---- Tools ----
    tools = [
        ("nano_banana", "Nano Banana"),
        ("jimeng", "即梦"),
        ("gpt15", "GPT 1.5"),
        ("runninghub", "RunningHub"),
    ]

    for key, label in tools:
        exists = conn.execute(sa.text("SELECT 1 FROM tools WHERE key=:k"), {"k": key}).fetchone()
        if not exists:
            conn.execute(
                sa.text("INSERT INTO tools (id, key, label, created_at) VALUES (:id, :key, :label, :created_at)"),
                {"id": _id(), "key": key, "label": label, "created_at": now},
            )

    # ---- Categories ----
    # Keep order stable. You can extend later without breaking existing ids if you prefer fixed ids.
    categories = [
        "3D",
        "动物",
        "建筑",
        "品牌",
        "卡通",
        "角色",
        "黏土",
        "创意",
        "数据可视化",
        "表情符号",
        "奇幻",
        "时尚",
        "毛毡",
        "美食",
        "未来风",
        "游戏",
        "插画",
        "信息图",
        "室内",
        "风景",
        "标志",
        "极简",
        "自然",
        "纸艺",
        "摄影",
        "肖像",
        "玩具",
    ]

    for i, name in enumerate(categories):
        exists = conn.execute(sa.text("SELECT 1 FROM categories WHERE name=:n"), {"n": name}).fetchone()
        if not exists:
            conn.execute(
                sa.text(
                    "INSERT INTO categories (id, name, sort_order, is_active, created_at) "
                    "VALUES (:id, :name, :sort_order, :is_active, :created_at)"
                ),
                {"id": _id(), "name": name, "sort_order": (i + 1) * 10, "is_active": 1, "created_at": now},
            )


def downgrade() -> None:
    conn = op.get_bind()

    # Remove seeded tools (by key)
    for key in ("nano_banana", "jimeng", "gpt15", "runninghub"):
        conn.execute(sa.text("DELETE FROM tools WHERE key=:k"), {"k": key})

    # Remove seeded categories (by name)
    names = [
        "3D",
        "动物",
        "建筑",
        "品牌",
        "卡通",
        "角色",
        "黏土",
        "创意",
        "数据可视化",
        "表情符号",
        "奇幻",
        "时尚",
        "毛毡",
        "美食",
        "未来风",
        "游戏",
        "插画",
        "信息图",
        "室内",
        "风景",
        "标志",
        "极简",
        "自然",
        "纸艺",
        "摄影",
        "肖像",
        "玩具",
    ]
    for n in names:
        conn.execute(sa.text("DELETE FROM categories WHERE name=:n"), {"n": n})
