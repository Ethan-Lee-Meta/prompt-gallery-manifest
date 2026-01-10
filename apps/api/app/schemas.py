from __future__ import annotations

from datetime import datetime
from typing import Optional, List, Literal

from pydantic import BaseModel, Field, ConfigDict

from typing import Optional, List
from pydantic import BaseModel, Field

from pydantic import BaseModel, Field
from typing import List

from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


# ---------- Create/Update inputs ----------

class ItemCreateMeta(BaseModel):
    """
    Upload meta. For convenience, allow either tool_id or tool_key.
    """
    title: str
    prompt_blob: str

    tool_id: Optional[str] = None
    tool_key: Optional[str] = None

    series_id: Optional[str] = None
    category_id: Optional[str] = None  # Manual category selection (will lock category)
    tags: List[str] = Field(default_factory=list)


class ItemPatch(BaseModel):
    title: Optional[str] = None
    series_id: Optional[str] = None
    category_id: Optional[str] = None
    tags: Optional[List[str]] = None  # replace-all semantics when provided


class ItemVersionCreate(BaseModel):
    prompt_blob: str
    note: Optional[str] = None


# ---------- DTOs ----------

class ToolDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    key: str
    label: str


class CategoryDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str


class SeriesSnapshotDTO(BaseModel):
    id: Optional[str] = None
    name_snapshot: Optional[str] = None
    delimiter_snapshot: Optional[str] = None


class ItemVersionDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    v: int
    prompt_blob: str
    note: Optional[str] = None
    created_at: datetime


class AutoCategoryDTO(BaseModel):
    category: CategoryDTO
    confidence: Optional[float] = None


class AutoCandidateDTO(BaseModel):
    category: CategoryDTO
    score: float


class ItemDTO(BaseModel):
    id: str
    title: str

    tool: ToolDTO
    media_type: Literal["image", "video"]

    media_url: str
    thumb_url: str
    poster_url: Optional[str] = None

    series: SeriesSnapshotDTO

    category: CategoryDTO
    auto_category: Optional[AutoCategoryDTO] = None

    tags: List[str] = Field(default_factory=list)
    auto_candidates: List[AutoCandidateDTO] = []
    current_version: ItemVersionDTO

    created_at: datetime
    updated_at: datetime

    is_deleted: bool
    deleted_at: Optional[datetime] = None

    media_sha256: Optional[str] = None


class PageDTO(BaseModel):
    items: List[ItemDTO]
    page: int
    page_size: int
    total: int


class CategoryListDTO(BaseModel):
    items: List[CategoryDTO]


class ToolListDTO(BaseModel):
    items: List[ToolDTO]


# ---------- Series inputs ----------
class SeriesCreate(BaseModel):
    name: str
    delimiter: str = "｜"
    base_prompt_blob: str
    tags: List[str] = Field(default_factory=list)


class SeriesPatch(BaseModel):
    name: Optional[str] = None
    delimiter: Optional[str] = None
    tags: Optional[List[str]] = None  # replace-all semantics when provided


class SeriesVersionCreate(BaseModel):
    base_prompt_blob: str
    note: Optional[str] = None


# ---------- Series DTOs ----------
class SeriesVersionDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    v: int
    base_prompt_blob: str
    note: Optional[str] = None
    created_at: datetime


class SeriesDTO(BaseModel):
    id: str
    name: str
    delimiter: str
    tags: List[str] = Field(default_factory=list)
    current_version: SeriesVersionDTO
    created_at: datetime
    updated_at: datetime


class SeriesPurgeRequest(BaseModel):
    confirm: str = Field(..., description='Must be exactly "PURGE"')


class SeriesPurgeDeletedRequest(BaseModel):
    confirm: str = Field(..., description='Must be exactly "PURGE"')
    limit: int = Field(default=2000, ge=1, le=20000)


class ItemsBulkPatch(BaseModel):
    item_ids: List[str] = Field(min_length=1, max_length=500)

    # optional operations (apply if provided)
    category_id: Optional[str] = None
    series_id: Optional[str] = None  # "" means clear series (optional behavior; route will treat "" as None)

    # tag ops:
    # - if tags_set provided => replace-all tags
    # - else apply add/remove to existing tags
    tags_set: Optional[List[str]] = None
    tags_add: List[str] = Field(default_factory=list)
    tags_remove: List[str] = Field(default_factory=list)


class ItemsBulkIds(BaseModel):
    item_ids: List[str] = Field(min_length=1, max_length=2000)




class ItemsBulkPurgeRequest(BaseModel):
    confirm: str = Field(..., description='Must be exactly "PURGE"')
    item_ids: List[str] = Field(min_length=1, max_length=2000)
    purge_files: bool = True

class DuplicateItemLiteDTO(BaseModel):
    id: str
    title: str
    media_type: str
    thumb_url: str
    media_url: str
    tool_label: str
    created_at: datetime
    is_deleted: bool

    media_exists: bool
    thumb_exists: bool
    poster_exists: Optional[bool] = None

class DuplicateGroupDTO(BaseModel):
    key: str  # sha or sha|tool_id
    media_sha256: str
    tool_id: Optional[str] = None
    tool_label: Optional[str] = None
    count: int
    items: List[DuplicateItemLiteDTO]

class DuplicatePageDTO(BaseModel):
    page: int
    page_size: int
    total_groups: int
    groups: List[DuplicateGroupDTO]
