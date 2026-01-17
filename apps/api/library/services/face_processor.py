"""
Process assets to detect and group faces

MVP approach:
- For each person asset, detect faces
- Create one person per detected face (simple, no grouping yet)
- Save face crops
"""
import uuid
import time
import logging
from pathlib import Path
from typing import List, Optional

from library.db import get_db, dict_from_row
from library.services.face_detector import detect_faces_simple, save_face_crop, extract_face_embedding
import numpy as np

logger = logging.getLogger(__name__)

STORAGE_ROOT = Path(".data/library/storage").resolve()


def generate_person_id() -> str:
    """Generate unique person ID"""
    return f"p{uuid.uuid4().hex[:12]}"



def generate_face_id() -> str:
    """Generate unique face ID"""
    return f"f{uuid.uuid4().hex[:12]}"


def cosine_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """
    Calculate cosine similarity between two embeddings
    
    Args:
        embedding1: First embedding vector
        embedding2: Second embedding vector
        
    Returns:
        Similarity score between -1 and 1 (higher = more similar)
    """
    dot_product = np.dot(embedding1, embedding2)
    norm1 = np.linalg.norm(embedding1)
    norm2 = np.linalg.norm(embedding2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)


def find_matching_person(embedding: bytes, threshold: float = 0.6) -> Optional[str]:
    """
    Find existing person with similar face embedding
    
    Args:
        embedding: Face embedding bytes to match
        threshold: Similarity threshold (default 0.6)
        
    Returns:
        person_id if match found, None otherwise
    """
    if not embedding:
        return None
    
    embedding_array = np.frombuffer(embedding, dtype=np.float64)
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get all people with at least one embedding
        cursor.execute("""
            SELECT DISTINCT person_id, embedding 
            FROM face_instances 
            WHERE embedding IS NOT NULL
            AND person_id IS NOT NULL
            AND excluded = 0
        """)
        
        best_match = None
        best_similarity = threshold
        
        for row in cursor.fetchall():
            person_id = row[0]
            stored_embedding_bytes = row[1]
            
            if not stored_embedding_bytes:
                continue
            
            stored_embedding = np.frombuffer(stored_embedding_bytes, dtype=np.float64)
            
            similarity = cosine_similarity(embedding_array, stored_embedding)
            
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = person_id
                logger.info(f"Found match: person {person_id} with similarity {similarity:.3f}")
        
        return best_match


def process_asset_for_faces(asset_id: str, asset_path: str) -> int:
    """
    Process an asset to detect faces
    
    Args:
        asset_id: Asset ID
        asset_path: Absolute path to asset file
        
    Returns:
        Number of faces detected and processed
    """
    logger.info(f"Processing asset {asset_id} for faces...")
    
    # Detect faces
    faces = detect_faces_simple(asset_path)
    
    if not faces:
        logger.info(f"No faces detected in asset {asset_id}")
        return 0
    
    logger.info(f"Detected {len(faces)} face(s) in asset {asset_id}")
    
    created_at = int(time.time())
    faces_created = 0
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        for face_idx, face_data in enumerate(faces):
            face_id = generate_face_id()
            
            # Save face crop to temp location first
            temp_dir = STORAGE_ROOT / "people" / "temp" / face_id
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_crop_path = temp_dir / f"face_{face_id}.jpg"
            
            crop_success = save_face_crop(
                asset_path,
                face_data,
                str(temp_crop_path)
            )
            
            if not crop_success:
                logger.warning(f"Failed to save face crop for {face_id}")
                continue
            
            # Extract embedding for clustering
            logger.info(f"Extracting embedding for face {face_id}...")
            embedding_bytes = extract_face_embedding(asset_path, face_data)
            
            if not embedding_bytes:
                logger.warning(f"Failed to extract embedding for {face_id}, creating standalone person")
            
            # Try to find matching person using embedding
            person_id = None
            if embedding_bytes:
                person_id = find_matching_person(embedding_bytes, threshold=0.6)
            
            if person_id:
                logger.info(f"Matched face to existing person {person_id}")
            else:
                # Create new person
                person_id = generate_person_id()
                person_name = f"Person {person_id[:8]}"
                cursor.execute("""
                    INSERT INTO people (id, name, status, confidence, created_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (person_id, person_name, "Needs Review", face_data.get('confidence', 0.0), created_at))
                logger.info(f"Created new person {person_id}")
            
            # Move face crop to person's folder
            person_face_dir = STORAGE_ROOT / "people" / person_id / "faces"
            person_face_dir.mkdir(parents=True, exist_ok=True)
            final_face_path = person_face_dir / f"face_{face_id}.jpg"
            
            temp_crop_path.rename(final_face_path)
            # Clean up temp directory
            try:
                temp_dir.rmdir()
            except:
                pass
            
            # Web path for HTTP access
            crop_web_path = f"/library-files/people/{person_id}/faces/face_{face_id}.jpg"
            bucket = "frontal"
            
            # Insert face_instance with embedding
            cursor.execute("""
                INSERT INTO face_instances (
                    id, asset_id, person_id,
                    bbox_x, bbox_y, bbox_width, bbox_height,
                    crop_path, yaw, pitch, roll, quality, bucket,
                    excluded, pinned, embedding, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                face_id,
                asset_id,
                person_id,
                face_data['bbox_x'],
                face_data['bbox_y'],
                face_data['bbox_width'],
                face_data['bbox_height'],
                crop_web_path,
                None,  # yaw
                None,  # pitch
                None,  # roll
                face_data.get('confidence', 0.0),  # quality
                bucket,
                0,  # excluded
                0,  # pinned
                embedding_bytes,  # embedding - NEW!
                created_at
            ))
            
            faces_created += 1
        
        conn.commit()
    
    logger.info(f"Created {faces_created} person(s) from asset {asset_id}")
    return faces_created


def process_all_person_assets():
    """
    Process all existing person assets that haven't been processed yet
    
    Returns:
        Number of assets processed
    """
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Find all person assets
        cursor.execute("""
            SELECT id, storage_path FROM assets 
            WHERE kind = 'person'
        """)
        assets = cursor.fetchall()
    
    processed = 0
    for row in assets:
        asset_id = row[0]
        storage_path = row[1]
        
        # Check if this asset already has face instances
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM face_instances WHERE asset_id = ?", (asset_id,))
            count = cursor.fetchone()[0]
            
            if count > 0:
                logger.info(f"Asset {asset_id} already processed, skipping")
                continue
        
        # Convert web path to file system path
        # storage_path format: /library-files/assets/{id}/original.ext
        # Convert to: .data/library/storage/assets/{id}/original.ext
        if storage_path.startswith("/library-files/"):
            rel_path = storage_path.replace("/library-files/", "")
            abs_path = STORAGE_ROOT / rel_path
        else:
            # Old format absolute path
            abs_path = Path(storage_path)
        
        if not abs_path.exists():
            logger.warning(f"Asset file not found: {abs_path}")
            continue
        
        try:
            process_asset_for_faces(asset_id, str(abs_path))
            processed += 1
        except Exception as e:
            logger.error(f"Failed to process asset {asset_id}: {e}")
    
    return processed
