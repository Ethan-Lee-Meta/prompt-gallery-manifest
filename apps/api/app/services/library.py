import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

from app.settings import settings
# from app.models_library import PersonRef, FaceInstance, Asset 
# (Imports commented out to avoid circular deps if not needed in MVP stub. 
#  In full implementation we query DB. For MVP "materialize" we might check strictness/availability)

class LibraryService:
    def __init__(self):
        # Resolve storage root to absolute path
        self.root = Path(settings.storage_root).resolve()
        
    def _is_safe_person_id(self, person_id: str) -> bool:
        """Validate person_id format (alphanumeric, underscore, hyphen)."""
        return all(c.isalnum() or c in "_-" for c in person_id)

    def _get_person_dir(self, person_id: str) -> Path:
        if not self._is_safe_person_id(person_id):
            raise ValueError(f"Invalid person_id: {person_id}")
        
        # Structure: <root>/library/people/<id>
        # Note: settings.storage_root might point to e.g. "storage". 
        # We append "library/people" to match the requirement contract.
        p_dir = self.root / "library" / "people" / person_id
        
        # Security check: ensure resolved path is inside root
        if not str(p_dir.resolve()).startswith(str(self.root)):
            raise ValueError("Path traversal detected")
            
        return p_dir

    def get_refs_folder(self, person_id: str) -> str:
        """Return the absolute path to the refs folder."""
        p_dir = self._get_person_dir(person_id)
        refs_dir = p_dir / "refs"
        return str(refs_dir)

    def materialize_refs(self, person_id: str) -> bool:
        """
        Materialize reference face crops into the refs folder.
        Queries the DB for PersonRef -> FaceInstance -> Asset,
        crops the original asset, and saves to the refs folder.
        """
        # Lazy imports to avoid circular deps at module level if any, 
        # and to ensure models are loaded when method runs.
        from sqlmodel import select, Session
        from datetime import datetime
        from PIL import Image
        from app.db import engine
        from app.models_library import PersonRef, FaceInstance, Asset

        refs_dir = Path(self.get_refs_folder(person_id))
        refs_dir.mkdir(parents=True, exist_ok=True)
        
        # Track status for manifest
        buckets_meta = {}
        
        with Session(engine) as session:
            # Query refs for this person
            refs = session.exec(select(PersonRef).where(PersonRef.person_id == person_id)).all()
            
            for ref in refs:
                # 1. Get Face
                face = session.get(FaceInstance, ref.face_id)
                if not face:
                    buckets_meta[ref.bucket] = {"status": "error", "note": f"Face {ref.face_id} not found"}
                    continue
                
                # 2. Get Asset
                asset = session.get(Asset, face.asset_id)
                if not asset:
                    buckets_meta[ref.bucket] = {"status": "error", "note": f"Asset {face.asset_id} not found"}
                    continue
                    
                # 3. Resolve Path
                src_path = self.root / asset.storage_relpath
                if not src_path.exists():
                    buckets_meta[ref.bucket] = {"status": "error", "note": "Source asset file missing"}
                    continue
                    
                # 4. Crop & Save
                target_name = f"{ref.bucket}_{face.id}.jpg"
                target_path = refs_dir / target_name
                
                try:
                    with Image.open(src_path) as im:
                        # bbox: x, y, w, h -> left, upper, right, lower
                        box = (
                            face.bbox_x, 
                            face.bbox_y, 
                            face.bbox_x + face.bbox_w, 
                            face.bbox_y + face.bbox_h
                        )
                        # Validate box against image size? PIL crop handles out of bounds somewhat but better to be safe?
                        # For MVP we trust DB bboxes are reasonable.
                        crop = im.crop(box)
                        crop.save(target_path, quality=95)
                        
                    buckets_meta[ref.bucket] = {
                        "status": "ok", 
                        "face_id": face.id, 
                        "asset_id": asset.id,
                        "file": target_name,
                        "quality": face.quality_score
                    }
                except Exception as e:
                     buckets_meta[ref.bucket] = {"status": "error", "note": f"Crop failed: {e}"}

        # Write manifest
        manifest_data = {
            "person_id": person_id,
            "generated_at": str(datetime.now()),
            "buckets": buckets_meta
        }
        
        manifest_path = refs_dir / "manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2)
            
        return True

    def reveal_folder(self, path_str: str) -> bool:
        """Reveal the folder in OS file explorer."""
        path = Path(path_str)
        if not path.exists():
            return False
            
        try:
            if sys.platform == "win32":
                os.startfile(str(path))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(path)])
            else: # linux
                subprocess.Popen(["xdg-open", str(path)])
            return True
        except Exception as e:
            print(f"Error revealing folder: {e}")
            return False

from datetime import datetime
library_service = LibraryService()
