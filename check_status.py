import sqlite3
import requests
from pathlib import Path

# Check DB
db_path = Path(".data/prompt-gallery-app.db").resolve()
try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM series")
    print(f"Series Count: {cur.fetchone()[0]}")
    conn.close()
except Exception as e:
    print(f"DB Error: {e}")

# Check API
try:
    resp = requests.get("http://127.0.0.1:8000/people")
    print("API Response:", resp.json())
except Exception as e:
    print(f"API Error: {e}")
