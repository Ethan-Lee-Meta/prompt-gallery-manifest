from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return v if v is not None and v != "" else default


@dataclass(frozen=True)
class Settings:
    # DB
    database_url: str = _env("DATABASE_URL", "sqlite:///./data/app.db")

    # Storage
    storage_root: Path = Path(_env("STORAGE_ROOT", "./data/storage")).resolve()

    # Web
    app_name: str = _env("APP_NAME", "prompt-gallery-api")
    allow_origins: str = _env("ALLOW_ORIGINS", "*")  # comma-separated, use "*" for dev

    # Optional: in dev, allow creating tables if DB empty (NOT for prod; prod uses Alembic)
    auto_create_tables: bool = _env("AUTO_CREATE_TABLES", "false").lower() in ("1", "true", "yes")

    # --- Auto category tuning (env-overridable) ---
    auto_cat_threshold: float = float(_env("AUTO_CAT_THRESHOLD", "0.32"))
    auto_cat_topk: int = int(_env("AUTO_CAT_TOPK", "3"))

    # prototypes (centroids)
    auto_cat_min_samples_per_cat: int = int(_env("AUTO_CAT_MIN_SAMPLES_PER_CAT", "3"))
    auto_cat_sample_per_cat: int = int(_env("AUTO_CAT_SAMPLE_PER_CAT", "200"))

    # lightweight boosts
    auto_cat_face_boost: float = float(_env("AUTO_CAT_FACE_BOOST", "0.07"))
    auto_cat_face_near_band: float = float(_env("AUTO_CAT_FACE_NEAR_BAND", "0.10"))

    auto_cat_text_boost: float = float(_env("AUTO_CAT_TEXT_BOOST", "0.03"))
    auto_cat_text_near_band: float = float(_env("AUTO_CAT_TEXT_NEAR_BAND", "0.12"))

    # keywords (comma-separated)
    auto_cat_face_keywords: str = _env("AUTO_CAT_FACE_KEYWORDS", "肖像,角色,人物,人像")
    auto_cat_person_text_keywords: str = _env("AUTO_CAT_PERSON_TEXT_KEYWORDS", (
        "人像,肖像,人物,角色,写真,脸,面部,眼妆,唇,妆容,证件照,"
        "portrait,face,headshot,beauty,model,character,close-up,closeup,macro portrait"
    ))


settings = Settings()
