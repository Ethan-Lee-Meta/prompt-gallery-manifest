from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models_library import Person
from app.services.library_data import library_data

router = APIRouter(prefix="/people")

class PersonRead(Person):
    cover_face_relpath: Optional[str] = None

@router.get("", response_model=List[PersonRead])
def list_people(
    page: int = Query(1, ge=1),
    limit: int = 20,
    status: Optional[str] = None,
    session: Session = Depends(get_session)
):
    offset = (page - 1) * limit
    people = library_data.list_people(session, status=status, limit=limit, offset=offset)
    
    # Enrich with cover face path
    # MVP: Simple fetch or modify library_data to return joined
    # Let's do a simple fetch for now as batch size is small (20)
    results = []
    from app.models_library import FaceInstance
    
    for p in people:
        p_read = PersonRead.model_validate(p)
        if p.cover_face_id:
            face = session.get(FaceInstance, p.cover_face_id)
            if face:
                p_read.cover_face_relpath = face.face_crop_relpath
        results.append(p_read)
        
    return results

@router.get("/{person_id}", response_model=Person)
def get_person(
    person_id: str,
    session: Session = Depends(get_session)
):
    person = library_data.get_person(session, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person

# TODO: Add endpoints for merging, setting refs, etc. as per WO-030
