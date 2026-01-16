from __future__ import annotations

from contextlib import contextmanager
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.engine import Engine

from app.settings import settings


def make_engine() -> Engine:
    # SQLite needs check_same_thread=False for typical FastAPI usage
    connect_args = {}
    if settings.database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}

    return create_engine(
        settings.database_url,
        echo=False,
        connect_args=connect_args,
        pool_pre_ping=True,
    )


engine = make_engine()


def init_db() -> None:
    """
    Dev convenience ONLY. In real environments, use Alembic migrations.
    Controlled by AUTO_CREATE_TABLES=true.
    """
    from app import models  # noqa: F401  ensure metadata loaded
    from app import models_library # noqa: F401 ensure library models loaded
    SQLModel.metadata.create_all(engine)


@contextmanager
def session_scope() -> Session:
    with Session(engine) as session:
        yield session


def get_session():
    with Session(engine) as session:
        yield session
