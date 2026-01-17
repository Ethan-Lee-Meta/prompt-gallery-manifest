"""
Faces routes - /library/faces/* endpoints
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from library.db import get_db

router = APIRouter(prefix="/library/faces")


class PinRequest(BaseModel):
    pinned: bool


class ExcludeRequest(BaseModel):
    excluded: bool


class SetRefRequest(BaseModel):
    bucket: str
    face_id: str


@router.post("/{face_id}/pin")
def pin_face(face_id: str, req: PinRequest):
    """Pin or unpin a face"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE face_instances 
            SET pinned = ?
            WHERE id = ?
        """, (1 if req.pinned else 0, face_id))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Face not found")
        
        return {"ok": True, "pinned": req.pinned}


@router.post("/{face_id}/exclude")
def exclude_face(face_id: str, req: ExcludeRequest):
    """Exclude or include a face"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE face_instances 
            SET excluded = ?
            WHERE id = ?
        """, (1 if req.excluded else 0, face_id))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Face not found")
        
        return {"ok": True, "excluded": req.excluded}


@router.post("/people/{person_id}/refs")
def set_ref(person_id: str, req: SetRefRequest):
    """Manually set a representative face for a bucket"""
    import time
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify face exists and belongs to this person
        cursor.execute("""
            SELECT id FROM face_instances 
            WHERE id = ? AND person_id = ?
        """, (req.face_id, person_id))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=400, detail="Face not found or doesn't belong to this person")
        
        # Insert or replace ref
        cursor.execute("""
            INSERT OR REPLACE INTO person_refs (person_id, bucket, face_id, selected_by, selected_at)
            VALUES (?, ?, ?, 'manual', ?)
        """, (person_id, req.bucket, req.face_id, int(time.time())))
        
        conn.commit()
        
        return {"ok": True}
