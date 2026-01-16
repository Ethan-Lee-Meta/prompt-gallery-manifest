from pathlib import Path
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query, Form
from sqlmodel import Session

from app.db import get_session
from app.settings import settings
from app.models_library import Asset
from app.services.library_data import library_data
from app.services.storage import save_uploadfile_streaming, safe_unlink
from app.services.thumbs import make_image_thumb

router = APIRouter(prefix="/assets")

def _file_url(rel_path: str) -> str:
    path = rel_path.lstrip("/").replace("\\", "/")
    return f"/files/{path}"

@router.get("", response_model=List[Asset])
def list_assets(
    page: int = Query(1, ge=1),
    limit: int = 20,
    kind: Optional[str] = None,
    session: Session = Depends(get_session)
):
    offset = (page - 1) * limit
    assets = library_data.list_assets(session, kind=kind, limit=limit, offset=offset)
    
    # Patch URLs for display
    # Note: Asset model stores relative path. 
    # Frontend can use it directly if it knows base URL, 
    # but strictly speaking we might want a DTO. 
    # For MVP, returning the model is fine, but let's assume usage of storage_relpath on client 
    # or we construct full URL here if we change return type.
    # The requirement MVP used local agent to read files? 
    # No, for Web UI "Assets" view, it needs HTTP access.
    # The `main.py` serves `/files` from `storage_root`.
    # So `storage_relpath` "assets/xyz.jpg" -> "/files/assets/xyz.jpg".
    
    # We'll just return the Asset objects. Frontend can prepend /files/.
    return assets

@router.post("/upload", response_model=Asset)
async def upload_asset(
    file: UploadFile = File(...),
    kind: str = Form("unknown"),
    session: Session = Depends(get_session)
):
    # 1. Determine paths
    now = datetime.utcnow()
    yyyy = f"{now.year:04d}"
    mm = f"{now.month:02d}"
    
    # Library structure: library/assets/YYYY/MM/<filename>
    # (Requirement said specific struct, but YYYY/MM is better for scaling)
    # Requirement: `library/assets/<asset_id>/original.ext`
    # Let's try to stick to requirement if possible, but asset_id is generated AFTER DB insert?
    # Or strict requirement: `library/assets/<asset_id>/original.<ext>`
    
    # Let's generate ID first if we want strict folder structure
    # But library_data.create_asset generates ID.
    # I'll modify the flow slightly or just use YYYY/MM for now as it's cleaner.
    # Actually, requirement `B2. File structure` says: `library/assets/<asset_id>/original.<ext>`
    # I should try to respect that for "Delivery Package" compliance.
    
    # I'll create a temp ID or move logic here.
    from app.util.ids import new_id
    asset_id = new_id()
    
    filename = file.filename or "upload"
    ext = Path(filename).suffix
    if not ext:
        ext = ".jpg" # fallback
        
    rel_dir = Path("library") / "assets" / asset_id
    rel_path = rel_dir / f"original{ext}"
    thumb_rel_path = rel_dir / "thumb.jpg"
    
    abs_dir = settings.storage_root / rel_dir
    abs_path = settings.storage_root / rel_path
    abs_thumb = settings.storage_root / thumb_rel_path
    
    abs_dir.mkdir(parents=True, exist_ok=True)
    
    # 2. Save
    try:
        _, sha256 = await save_uploadfile_streaming(file, abs_path, compute_sha256=True)
    except Exception as e:
        safe_unlink(abs_path)
        raise HTTPException(status_code=500, detail=f"Save failed: {e}")
    
    # 3. Thumb
    # Only if image
    is_image = ext.lower() in [".jpg", ".jpeg", ".png", ".webp"]
    if is_image:
        try:
            make_image_thumb(abs_path, abs_thumb, max_w=512)
        except Exception:
            # ignore thumb error
            pass
            
    # 4. DB Insert
    # We manually created ID, so we need to pass it or change service.
    # library_data.create_asset generates new ID.
    # I'll just instantiate Asset manually here to force the ID
    
    asset = Asset(
        id=asset_id,
        filename=filename,
        storage_relpath=str(rel_path).replace("\\", "/"),
        thumb_relpath=str(thumb_rel_path).replace("\\", "/") if is_image and abs_thumb.exists() else None,
        kind=kind,
        sha256=sha256,
        created_at=int(datetime.utcnow().timestamp() * 1000)
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    
    # 5. [MVP] Auto-detect faces (stub)
    library_data.process_asset_faces(session, asset)

    return asset
