from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import Category
from app.schemas import CategoryListDTO, CategoryDTO

router = APIRouter()


@router.get("/categories", response_model=CategoryListDTO)
def list_categories(session: Session = Depends(get_session)):
    rows = session.exec(
        select(Category).where(Category.is_active == True).order_by(Category.sort_order.asc())
    ).all()
    return CategoryListDTO(items=[CategoryDTO(id=r.id, name=r.name) for r in rows])
