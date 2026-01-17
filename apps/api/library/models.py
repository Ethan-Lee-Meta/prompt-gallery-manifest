"""
Library models - Pydantic models for library entities
"""
from typing import Optional, List, Any
from pydantic import BaseModel


class AssetDTO(BaseModel):
    id: str
    sha256: Optional[str] = None
    kind: str  # person/landscape/architecture/film/product/document
    filename: str
    source: Optional[str] = None
    storage_path: str
    thumb_path: Optional[str] = None
    created_at: int
    updated_at: Optional[int] = None
    people: Optional[List[str]] = []  # person IDs
    tags: Optional[List[str]] = []


class FaceInstanceDTO(BaseModel):
    id: str
    asset_id: str
    person_id: Optional[str] = None
    bbox_x: Optional[int] = None
    bbox_y: Optional[int] = None
    bbox_width: Optional[int] = None
    bbox_height: Optional[int] = None
    crop_path: Optional[str] = None
    yaw: Optional[float] = None
    pitch: Optional[float] = None
    roll: Optional[float] = None
    quality: Optional[float] = None
    bucket: Optional[str] = None  # frontal/l3q/r3q/lprofile/rprofile/up/down
    excluded: bool = False
    pinned: bool = False
    created_at: int


class PersonDTO(BaseModel):
    id: str
    name: str
    status: str = "Needs Review"  # Verified/Needs Review/Noise
    confidence: float = 0.0
    cover_face_id: Optional[str] = None
    faces_count: int = 0
    assets_count: int = 0
    created_at: int
    updated_at: Optional[int] = None
    coverage: Optional[dict] = {}  # {bucket: bool}
    refs: Optional[dict] = {}  # {bucket: face_id}
    tags: Optional[List[str]] = []


class PersonRefDTO(BaseModel):
    person_id: str
    bucket: str
    face_id: str
    selected_by: str = "auto"  # auto/manual
    selected_at: int


class ListResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
