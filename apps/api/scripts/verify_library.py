import sys
import os
import requests
from PIL import Image
import io
from time import sleep

# Add parent dir to path to import app if needed for direct DB access
sys.path.append(os.getcwd())

from sqlmodel import Session, create_engine, select
from app.db import engine 
from app.models_library import Person, Asset, FaceInstance, PersonRef

BASE_URL = "http://127.0.0.1:7000"

def test_ping():
    print(f"Testing Ping at {BASE_URL}...")
    try:
        r = requests.get(f"{BASE_URL}/local/ping")
        assert r.status_code == 200, f"Ping failed: {r.text}"
        print("Ping OK")
    except Exception as e:
        print(f"Ping Exception: {e}")
        sys.exit(1)

def test_upload_and_materialize():
    print("Testing Upload & Materialize...")
    
    # 1. Create dummy image
    img = Image.new('RGB', (100, 100), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    
    # 2. Upload
    files = {'file': ('test_face.jpg', img_byte_arr, 'image/jpeg')}
    r = requests.post(f"{BASE_URL}/assets/upload", files=files)
    assert r.status_code == 200, f"Upload failed: {r.text}"
    asset = r.json()
    asset_id = asset["id"]
    print(f"Uploaded Asset: {asset_id}")
    
    # 3. Insert Face & Person & Ref (Direct DB)
    with Session(engine) as session:
        # Check if person exists
        pid = "test_p1"
        p = session.get(Person, pid)
        if not p:
            p = Person(id=pid, display_name="Test Person", status="Needs Review")
            session.add(p)
            
        # Create Face
        fid = f"{pid}_f1"
        face = FaceInstance(
            id=fid,
            asset_id=asset_id,
            bbox_x=10, bbox_y=10, bbox_w=50, bbox_h=50,
            face_crop_relpath="dummy",
            bucket="frontal",
            quality_score=0.9
        )
        session.merge(face) # Upsert
        
        # Create Ref
        ref = PersonRef(
            person_id=pid,
            bucket="frontal",
            face_id=fid,
            selected_by="manual"
        )
        session.merge(ref) # Upsert
        session.commit()
    
    print("Inserted mock DB data for materialization.")
    
    # 4. Trigger Open Refs (with prepare=True)
    # The /local/people/{id}/refs:open endpoint triggers materialize_refs
    url = f"{BASE_URL}/local/people/test_p1/refs:open"
    r = requests.post(url, json={"prepare": True, "reveal": False})
    
    if r.status_code != 200:
        print(f"Open failed details: {r.text}")
        
    assert r.status_code == 200, f"Open failed: {r.status_code}"
    print("Materialization Triggered OK")
    
    print("verification successful!")

if __name__ == "__main__":
    test_ping()
    test_upload_and_materialize()
