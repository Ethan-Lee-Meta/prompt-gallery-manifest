from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import Tool
from app.schemas import ToolListDTO, ToolDTO

router = APIRouter()


@router.get("/tools", response_model=ToolListDTO)
def list_tools(session: Session = Depends(get_session)):
    rows = session.exec(select(Tool).order_by(Tool.created_at.asc())).all()
    return ToolListDTO(items=[ToolDTO.model_validate(r) for r in rows])
