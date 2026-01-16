from __future__ import annotations

import uuid
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

from app.settings import settings
from app.db import init_db

from app.routes.items import router as items_router
from app.routes.tools import router as tools_router
from app.routes.categories import router as categories_router
from app.routes.series import router as series_router
from app.routes.maintenance import router as maintenance_router
from app.routes.library import router as library_router
from app.routes.library_assets import router as library_assets_router
from app.routes.library_people import router as library_people_router

app = FastAPI(title=settings.app_name)

origins = [o.strip() for o in settings.allow_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex.upper()
    request.state.request_id = rid
    resp = await call_next(request)
    resp.headers["x-request-id"] = rid
    return resp


def error_envelope(code: str, message: str, request_id: str, details=None):
    return {"error": {"code": code, "message": message, "details": details}, "request_id": request_id}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    rid = getattr(request.state, "request_id", uuid.uuid4().hex.upper())
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(detail["code"], detail["message"], rid, detail.get("details")),
        )
    # fallback
    return JSONResponse(
        status_code=exc.status_code,
        content=error_envelope("HTTP_ERROR", str(detail), rid),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", uuid.uuid4().hex.upper())
    return JSONResponse(
        status_code=HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_envelope("INTERNAL_ERROR", f"Unexpected server error: {exc}", rid),
    )


# Static files
storage_root = Path(settings.storage_root)
storage_root.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(storage_root), check_dir=False), name="files")


@app.get("/health")
def health():
    return {"status": "ok", "storage": {"status": "ok", "root": str(storage_root)}}


@app.on_event("startup")
def _startup():
    if settings.auto_create_tables:
        init_db()


# Routers
app.include_router(items_router, tags=["items"])
app.include_router(tools_router, tags=["tools"])
app.include_router(categories_router, tags=["categories"])
app.include_router(series_router, tags=["series"])
app.include_router(maintenance_router, tags=["maintenance"])
app.include_router(library_router, tags=["library"])
app.include_router(library_assets_router, tags=["library_assets"])
app.include_router(library_people_router, tags=["library_people"])
