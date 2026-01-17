"""
Database migration: Add embedding column to face_instances table
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(".data/library/library.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if column already exists
    cursor.execute("PRAGMA table_info(face_instances)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if "embedding" not in columns:
        print("Adding embedding column to face_instances table...")
        cursor.execute("ALTER TABLE face_instances ADD COLUMN embedding BLOB")
        conn.commit()
        print("[OK] Migration complete!")
    else:
        print("[OK] Embedding column already exists, skipping migration")
    
    conn.close()

if __name__ == "__main__":
    migrate()
