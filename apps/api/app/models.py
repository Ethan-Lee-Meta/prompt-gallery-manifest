from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from sqlmodel import SQLModel, Field, Relationship


# ---- Link Tables ----

class ItemTag(SQLModel, table=True):
    __tablename__ = "item_tags"
    item_id: str = Field(primary_key=True, foreign_key="items.id")
    tag_id: str = Field(primary_key=True, foreign_key="tags.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SeriesTag(SQLModel, table=True):
    __tablename__ = "series_tags"
    series_id: str = Field(primary_key=True, foreign_key="series.id")
    tag_id: str = Field(primary_key=True, foreign_key="tags.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---- Core Entities ----

class Tool(SQLModel, table=True):
    __tablename__ = "tools"
    id: str = Field(primary_key=True)
    key: str = Field(unique=True, index=True)
    label: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None)


class Category(SQLModel, table=True):
    __tablename__ = "categories"
    id: str = Field(primary_key=True)
    name: str = Field(unique=True, index=True)
    sort_order: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Tag(SQLModel, table=True):
    __tablename__ = "tags"
    id: str = Field(primary_key=True)
    name: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Series(SQLModel, table=True):
    __tablename__ = "series"
    id: str = Field(primary_key=True)
    name: str = Field(unique=True, index=True)
    delimiter: str = Field(default="｜")
    current_version_id: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = Field(default=False, index=True)
    deleted_at: Optional[datetime] = Field(default=None, index=True)


class SeriesVersion(SQLModel, table=True):
    __tablename__ = "series_versions"
    id: str = Field(primary_key=True)
    series_id: str = Field(foreign_key="series.id", index=True)
    v: int
    base_prompt_blob: str
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Item(SQLModel, table=True):
    __tablename__ = "items"
    id: str = Field(primary_key=True)
    title: str
    
    series_id: Optional[str] = Field(default=None, foreign_key="series.id")
    series_name_snapshot: Optional[str] = None
    delimiter_snapshot: Optional[str] = None

    tool_id: str = Field(foreign_key="tools.id")
    
    media_type: str = Field(default="image")  # image / video
    media_path: str
    thumb_path: str
    poster_path: Optional[str] = None
    
    category_id: str = Field(foreign_key="categories.id")
    auto_category_id: Optional[str] = Field(default=None, index=True, foreign_key="categories.id")
    auto_confidence: Optional[float] = Field(default=None, index=True)
    auto_candidates_json: Optional[str] = Field(default=None)
    is_category_locked: bool = Field(default=False, index=True)

    current_version_id: Optional[str] = Field(default=None)  # logic link to item_versions.id

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    is_deleted: bool = Field(default=False, index=True)
    deleted_at: Optional[datetime] = Field(default=None, index=True)

    media_sha256: Optional[str] = Field(default=None, index=True)


class ItemVersion(SQLModel, table=True):
    __tablename__ = "item_versions"
    id: str = Field(primary_key=True)
    item_id: str = Field(foreign_key="items.id", index=True)
    v: int
    prompt_blob: str
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---- Embeddings (BLOBs) ----

class CategoryEmbedding(SQLModel, table=True):
    __tablename__ = "category_embeddings"
    category_id: str = Field(primary_key=True, foreign_key="categories.id")
    model_key: str = Field(primary_key=True)
    dim: int
    vector_blob: bytes
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ItemEmbedding(SQLModel, table=True):
    __tablename__ = "item_embeddings"
    item_id: str = Field(primary_key=True, foreign_key="items.id")
    model_key: str = Field(primary_key=True)
    dim: int
    vector_blob: bytes
    created_at: datetime = Field(default_factory=datetime.utcnow)
