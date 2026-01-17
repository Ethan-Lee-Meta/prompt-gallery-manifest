#!/usr/bin/env python3
"""
Initialize library database and create sample data for testing
"""
import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from library.db import init_db, get_db


def create_sample_data():
    """Create some sample people and assets for testing"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Create sample people
        people = [
            ("p001", "Person 001", "Verified", 0.92),
            ("p002", "Person 002", "Needs Review", 0.85),
            ("p003", "Person 003", "Verified", 0.88),
        ]
        
        for pid, name, status, confidence in people:
            cursor.execute("""
                INSERT OR IGNORE INTO people (id, name, status, confidence, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (pid, name, status, confidence, int(time.time())))
        
        conn.commit()
        print(f"[OK] Created {len(people)} sample people")


if __name__ == "__main__":
    print("Initializing library database...")
    init_db()
    
    print("\nCreating sample data...")
    create_sample_data()
    
    print("\n[SUCCESS] Library initialization complete!")
    print(f"   Database: .data/library/library.db")
    print(f"   Storage: .data/library/storage/")
