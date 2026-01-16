import sqlite3
from pathlib import Path

db_path = Path(".data/prompt-gallery-app.db").resolve()
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def check_table(name):
    print(f"--- {name} ---")
    try:
        cur.execute(f"SELECT count(*) FROM {name}")
        count = cur.fetchone()[0]
        print(f"Count: {count}")
        
        if count > 0:
            cur.execute(f"SELECT * FROM {name} LIMIT 1")
            print(f"Sample: {dict(cur.fetchone())}")
        else:
            print("Empty.")
            
        cur.execute(f"PRAGMA table_info({name})")
        print("Columns:", [r[1] for r in cur.fetchall()])
        
    except Exception as e:
        print(f"Error: {e}")

check_table("tools")
check_table("series")
check_table("asset")

conn.close()
