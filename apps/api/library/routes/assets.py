"""
Assets routes - /library/assets/* endpoints
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from typing import Optional
import time
import hashlib
from pathlib import Path
import uuid
import shutil

from library.db import get_db, dict_from_row
from library.models import AssetDTO, ListResponse

router = APIRouter(prefix="/library/assets")

STORAGE_ROOT = Path(".data/library/storage").resolve()


def generate_asset_id() -> str:
    """Generate unique asset ID"""
    return f"a{uuid.uuid4().hex[:12]}"


def detect_kind(filename: str) -> str:
    """Simple kind detection based on extension"""
    ext = Path(filename).suffix.lower()
    if ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
        return "person"  # Default to person for images
    elif ext in ['.mp4', '.mov', '.avi', '.webm']:
        return "film"
    elif ext in ['.pdf', '.doc', '.docx']:
        return "document"
    return "unknown"


@router.get("")
def list_assets(
    kind: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """List assets with optional filters"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Build query
        query = "SELECT * FROM assets WHERE 1=1"
        params = []
        
        if kind:
            query += " AND kind = ?"
            params.append(kind)
        
        if q:
            query += " AND (filename LIKE ? OR source LIKE ?)"
            params.extend([f"%{q}%", f"%{q}%"])
        
        query += " ORDER BY created_at DESC"
        
        #  Count total
        count_query = query.replace("SELECT *", "SELECT COUNT(*)")
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]
        
        # Paginate
        offset = (page - 1) * page_size
        query += f" LIMIT ? OFFSET ?"
        params.extend([page_size, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        items = [AssetDTO(**dict_from_row(row)) for row in rows]
        
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size
        }


@router.post("/upload")
async def upload_asset(
    file: UploadFile = File(...),
    kind: Optional[str] = Form(None),
    source: Optional[str] = Form(None)
):
    """Upload a new asset"""
    # Generate ID and paths
    asset_id = generate_asset_id()
    asset_dir = STORAGE_ROOT / "assets" / asset_id
    asset_dir.mkdir(parents=True, exist_ok=True)
    
    # Save original file
    ext = Path(file.filename).suffix
    original_path = asset_dir / f"original{ext}"
    
    with original_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # Compute SHA256
    sha256 = hashlib.sha256()
    with original_path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    sha256_hex = sha256.hexdigest()
    
    # Detect kind if not provided
    if not kind:
        kind = detect_kind(file.filename)
    
    # Create asset record
    created_at = int(time.time())
    
    # Create relative path for HTTP serving
    # Storage structure: .data/library/storage/assets/{asset_id}/original.ext
    # HTTP path: /library-files/assets/{asset_id}/original.ext
    relative_path = f"/library-files/assets/{asset_id}/original{ext}"
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if file with same sha256 already exists
        cursor.execute("SELECT * FROM assets WHERE sha256 = ?", (sha256_hex,))
        existing = cursor.fetchone()
        
        if existing:
            # File already exists, return existing asset (clean up newly created directory)
            import shutil as sh
            sh.rmtree(asset_dir, ignore_errors=True)
            return AssetDTO(**dict_from_row(existing))
        
        cursor.execute("""
            INSERT INTO assets (id, sha256, kind, filename, source, storage_path, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (asset_id, sha256_hex, kind, file.filename, source or "Upload", relative_path, created_at))
        conn.commit()
    
    
    return AssetDTO(
        id=asset_id,
        sha256=sha256_hex,
        kind=kind,
        filename=file.filename,
        source=source or "Upload",
        storage_path=relative_path,
        created_at=created_at
    )


@router.get("/{asset_id}")
def get_asset(asset_id: str):
    """Get asset details"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM assets WHERE id = ?", (asset_id,))
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Asset not found")
        
        return AssetDTO(**dict_from_row(row))
