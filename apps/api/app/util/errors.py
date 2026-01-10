from __future__ import annotations

from fastapi import HTTPException


def raise_api_error(status_code: int, code: str, message: str, details=None) -> None:
    """
    Raise HTTPException with a structured detail payload; main.py will wrap it into an error envelope.
    """
    payload = {"code": code, "message": message, "details": details}
    raise HTTPException(status_code=status_code, detail=payload)
