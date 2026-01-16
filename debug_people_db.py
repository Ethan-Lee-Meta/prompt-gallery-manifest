import sqlite3
from pathlib import Path

db_path = Path(".data/prompt-gallery-app.db").resolve()
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("--- Person Table ---")
cur.execute("SELECT * FROM person")
rows = cur.fetchall()
if not rows:
    print("No people found.")
else:
    for r in rows:
        print(dict(r))

print("\n--- PersonRef Table ---")
cur.execute("SELECT * FROM personref")
rows = cur.fetchall()
for r in rows:
    print(dict(r))

print("\n--- FaceInstance Table ---")
cur.execute("SELECT * FROM faceinstance")
rows = cur.fetchall()
for r in rows:
    print(dict(r))

conn.close()
