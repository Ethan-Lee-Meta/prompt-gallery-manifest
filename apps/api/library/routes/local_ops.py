"""
Local operations routes - /local/* endpoints for folder operations
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
import re

from library.services.os_reveal import reveal_folder

router = APIRouter(prefix="/local")

# 数据根目录
LIBRARY_STORAGE = Path(".data/library/storage").resolve()


def validate_person_id(person_id: str) -> bool:
    """Validate person_id format (alphanumeric + underscore/hyphen only)"""
    return bool(re.match(r'^[a-zA-Z0-9_-]+$', person_id))


def ensure_under_root(path: Path) -> bool:
    """Ensure path is under LIBRARY_STORAGE (prevent path traversal)"""
    try:
        path.resolve().relative_to(LIBRARY_STORAGE)
        return True
    except ValueError:
        return False


@router.get("/ping")
def ping():
    """Health check for local agent"""
    return {
        "ok": True,
        "agent": "library-local-agent",
        "version": "1.0"
    }


@router.get("/people/{person_id}/refs-folder")
def get_refs_folder(person_id: str):
    """Get refs folder path for a person"""
    if not validate_person_id(person_id):
        raise HTTPException(status_code=400, detail="Invalid person_id format")
    
    refs_path = LIBRARY_STORAGE / "people" / person_id / "refs"
    
    if not ensure_under_root(refs_path):
        raise HTTPException(status_code=403, detail="Path traversal detected")
    
    return {
        "person_id": person_id,
        "path": str(refs_path.resolve())
    }


class OpenRefsRequest(BaseModel):
    prepare: bool = True
    reveal: bool = True


@router.post("/people/{person_id}/refs:open")
def open_refs_folder(person_id: str, req: OpenRefsRequest):
    """
    Open refs folder for a person
    - prepare: whether to materialize refs first (not implemented yet)
    - reveal: whether to open folder in file manager
    """
    if not validate_person_id(person_id):
        raise HTTPException(status_code=400, detail="Invalid person_id format")
    
    refs_path = LIBRARY_STORAGE / "people" / person_id / "refs"
    
    if not ensure_under_root(refs_path):
        raise HTTPException(status_code=403, detail="Path traversal detected")
    
    # Create directory if it doesn't exist
    refs_path.mkdir(parents=True, exist_ok=True)
    
    # TODO: Materialize refs if prepare=True
    prepared = False
    if req.prepare:
        # Will implement materialize later
        pass
    
    # Reveal folder
    if req.reveal:
        success = reveal_folder(refs_path)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to open folder")
    
    return {
        "ok": True,
        "path": str(refs_path.resolve()),
        "prepared": prepared
    }
