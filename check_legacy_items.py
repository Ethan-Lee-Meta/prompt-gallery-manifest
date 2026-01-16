import sqlite3
from pathlib import Path

db_path = Path("apps/api/data/app.db").resolve()
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print(f"Checking LEGACY DB: {db_path}")

tables = ["items", "categories"]
for t in tables:
    print(f"--- {t} ---")
    try:
        cur.execute(f"SELECT count(*) FROM {t}")
        count = cur.fetchone()[0]
        print(f"Count: {count}")
    except Exception as e:
        print(f"Error: {e}")

conn.close()
