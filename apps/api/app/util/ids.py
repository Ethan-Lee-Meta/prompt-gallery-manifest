from __future__ import annotations

import uuid


def new_id() -> str:
    # UUID4 hex uppercase: stable, sortable not required for MVP
    return uuid.uuid4().hex.upper()
