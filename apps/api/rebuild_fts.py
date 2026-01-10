from app.db import session_scope
from app.services.fts import fts_rebuild_all

with session_scope() as s:
    n = fts_rebuild_all(s)
    print("fts rebuilt:", n)
