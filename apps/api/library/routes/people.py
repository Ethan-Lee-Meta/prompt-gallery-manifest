"""
People routes - /library/people/* endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from library.db import get_db, dict_from_row
from library.models import PersonDTO

router = APIRouter(prefix="/library/people")


@router.get("")
def list_people(
    status: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    """List people with optional filters"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        query = "SELECT * FROM people WHERE 1=1"
        params = []
        
        if status:
            query += " AND status = ?"
            params.append(status)
        
        if q:
            query += " AND name LIKE ?"
            params.append(f"%{q}%")
        
        query += " ORDER BY created_at DESC"
        
        # Count total
        count_query = query.replace("SELECT *", "SELECT COUNT(*)")
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]
        
        # Paginate
        offset = (page - 1) * page_size
        query += f" LIMIT ? OFFSET ?"
        params.extend([page_size, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        items = []
        for row in rows:
            person_dict = dict_from_row(row)
            
            # Get coverage and refs
            person_id = person_dict["id"]
            coverage, refs = get_coverage_and_refs(cursor, person_id)
            
            person_dict["coverage"] = coverage
            person_dict["refs"] = refs
            
            items.append(PersonDTO(**person_dict))
        
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size
        }


@router.get("/{person_id}")
def get_person(person_id: str):
    """Get person details with faces"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM people WHERE id = ?", (person_id,))
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Person not found")
        
        person_dict = dict_from_row(row)
        
        # Get coverage and refs
        coverage, refs = get_coverage_and_refs(cursor, person_id)
        person_dict["coverage"] = coverage
        person_dict["refs"] = refs
        
        # Get faces
        cursor.execute("""
            SELECT * FROM face_instances 
            WHERE person_id = ? AND excluded = 0
            ORDER BY quality DESC
        """, (person_id,))
        faces = [dict_from_row(r) for r in cursor.fetchall()]
        
        return {
            **person_dict,
            "faces": faces
        }


@router.post("/{person_id}/verify")
def verify_person(person_id: str):
    """Mark person as verified"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE people 
            SET status = 'Verified'
            WHERE id = ?
        """, (person_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Person not found")
        
        return {"ok": True}


def get_coverage_and_refs(cursor, person_id: str) -> tuple[dict, dict]:
    """Get angle coverage and refs for a person"""
    BUCKETS = ["frontal", "l3q", "r3q", "lprofile", "rprofile", "up", "down"]
    
    # Get refs
    cursor.execute("""
        SELECT bucket, face_id 
        FROM person_refs 
        WHERE person_id = ?
    """, (person_id,))
    
    refs = {}
    for row in cursor.fetchall():
        refs[row["bucket"]] = row["face_id"]
    
    # Coverage is whether each bucket has a ref
    coverage = {bucket: bucket in refs for bucket in BUCKETS}
    
    return coverage, refs
