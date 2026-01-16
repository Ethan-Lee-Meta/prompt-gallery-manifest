from typing import List, Optional
from sqlmodel import Field, SQLModel, Relationship
from typing import Dict, Any
from datetime import datetime
import json

def current_time_ms():
    return int(datetime.now().timestamp() * 1000)

class Asset(SQLModel, table=True):
    id: str = Field(primary_key=True)
    sha256: Optional[str] = Field(default=None, index=True)
    kind: str = Field(index=True)  # person, landscape, etc.
    filename: str
    source: Optional[str] = None
    storage_relpath: str
    thumb_relpath: Optional[str] = None
    created_at: int = Field(default_factory=current_time_ms, index=True)

class FaceInstance(SQLModel, table=True):
    id: str = Field(primary_key=True)
    asset_id: str = Field(foreign_key="asset.id", index=True)
    
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    face_crop_relpath: str
    
    # Embedding stored as bytes (BLOB) for MVP
    embedding: Optional[bytes] = None
    embed_dim: Optional[int] = None
    
    quality_score: float = Field(default=0.0, index=True)
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0
    
    bucket: str = Field(index=True) # frontal, l3q, etc.
    excluded: bool = Field(default=False)
    pinned: bool = Field(default=False)
    created_at: int = Field(default_factory=current_time_ms)

class Person(SQLModel, table=True):
    id: str = Field(primary_key=True)
    display_name: str
    status: str = Field(default="Needs Review") # Verified, Needs Review, Noise
    confidence: float = 0.0
    cover_face_id: Optional[str] = None
    
    faces_count: int = 0
    assets_count: int = 0
    created_at: int = Field(default_factory=current_time_ms)

class PersonRef(SQLModel, table=True):
    """Selected representative face for a person in a specific angle bucket."""
    person_id: str = Field(primary_key=True)
    bucket: str = Field(primary_key=True)
    face_id: str
    selected_by: str = "auto" # auto, manual
    selected_at: int = Field(default_factory=current_time_ms)

class AuditEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    type: str # MERGE, SPLIT, EXCLUDE, etc.
    payload_json: str
    created_at: int = Field(default_factory=current_time_ms)
