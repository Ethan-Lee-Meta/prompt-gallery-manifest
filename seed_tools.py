import sys
from sqlmodel import Session, create_engine
from app.models import Tool
from datetime import datetime

# Explicit path
sqlite_url = "sqlite:///../../.data/prompt-gallery-app.db"
engine = create_engine(sqlite_url)

def current_time():
    return datetime.utcnow()

def seed_tools():
    defaults = [
        {"key": "midjourney", "label": "Midjourney"},
        {"key": "niji", "label": "Niji"},
        {"key": "stable-diffusion", "label": "Stable Diffusion"},
        {"key": "dalle", "label": "DALL-E 3"},
        {"key": "comfyui", "label": "ComfyUI"}
    ]
    
    with Session(engine) as session:
        for d in defaults:
            # Check existing
            existing = session.query(Tool).filter(Tool.key == d["key"]).first()
            if not existing:
                print(f"Adding tool: {d['label']}")
                t = Tool(
                    id=d["key"], # Use key as ID for simplicity or uuid
                    key=d["key"],
                    label=d["label"],
                    created_at=current_time(),
                    updated_at=current_time()
                )
                session.add(t)
        session.commit()
    print("Tools seeded.")

if __name__ == "__main__":
    seed_tools()
