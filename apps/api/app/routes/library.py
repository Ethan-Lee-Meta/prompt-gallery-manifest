from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.library import library_service

router = APIRouter(prefix="/local")

class OpenRefsRequest(BaseModel):
    prepare: bool = True
    reveal: bool = True

@router.get("/ping")
def ping():
    return {"ok": True, "agent": "umk-library-agent", "version": "0.1.0"}

@router.get("/people/{person_id}/refs-folder")
def get_refs_folder(person_id: str):
    try:
        path = library_service.get_refs_folder(person_id)
        return {"person_id": person_id, "path": path}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/people/{person_id}/refs:open")
def open_refs_folder(person_id: str, req: OpenRefsRequest):
    try:
        path = library_service.get_refs_folder(person_id)
        prepared = False
        
        if req.prepare:
            # Materialize refs (write manifest, copy crops)
            prepared = library_service.materialize_refs(person_id)
            
        if req.reveal:
            if not library_service.reveal_folder(path):
                # If folder doesn't exist (and prepare was false or failed), we can't open it
                raise HTTPException(status_code=404, detail="Refs folder not found (try prepare=true)")
                
        return {"ok": True, "path": path, "prepared": prepared}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
