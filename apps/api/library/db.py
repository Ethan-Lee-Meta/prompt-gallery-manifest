"""
Library database module - manages SQLite connection for library data
"""
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Generator

# 数据库路径：.data/library/library.db
LIBRARY_DB_PATH = Path(".data/library/library.db")


def init_db():
    """Initialize library database with schema"""
    LIBRARY_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(str(LIBRARY_DB_PATH))
    cursor = conn.cursor()
    
    # Assets table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            sha256 TEXT UNIQUE,
            kind TEXT NOT NULL,
            filename TEXT NOT NULL,
            source TEXT,
            storage_path TEXT NOT NULL,
            thumb_path TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER
        )
    """)
    
    # People table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS people (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'Needs Review',
            confidence REAL DEFAULT 0.0,
            cover_face_id TEXT,
            faces_count INTEGER DEFAULT 0,
            assets_count INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER
        )
    """)
    
    # Face instances table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS face_instances (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            person_id TEXT,
            bbox_x INTEGER,
            bbox_y INTEGER,
            bbox_width INTEGER,
            bbox_height INTEGER,
            crop_path TEXT,
            yaw REAL,
            pitch REAL,
            roll REAL,
            quality REAL,
            bucket TEXT,
            excluded INTEGER DEFAULT 0,
            pinned INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (asset_id) REFERENCES assets(id),
            FOREIGN KEY (person_id) REFERENCES people(id)
        )
    """)
    
    # Person refs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS person_refs (
            person_id TEXT NOT NULL,
            bucket TEXT NOT NULL,
            face_id TEXT NOT NULL,
            selected_by TEXT DEFAULT 'auto',
            selected_at INTEGER NOT NULL,
            PRIMARY KEY (person_id, bucket),
            FOREIGN KEY (person_id) REFERENCES people(id),
            FOREIGN KEY (face_id) REFERENCES face_instances(id)
        )
    """)
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_faces_asset ON face_instances(asset_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_faces_person ON face_instances(person_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_faces_bucket ON face_instances(bucket)")
    
    conn.commit()
    conn.close()
    print(f"[OK] Library database initialized at {LIBRARY_DB_PATH}")


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Get database connection with row factory"""
    conn = sqlite3.connect(str(LIBRARY_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def dict_from_row(row: sqlite3.Row) -> dict:
    """Convert sqlite3.Row to dict"""
    return {key: row[key] for key in row.keys()}
