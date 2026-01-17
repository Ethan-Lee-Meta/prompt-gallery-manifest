"""
Face detection service using DeepFace

Simplified MVP:
- Detect faces in images
- Extract face bounding boxes
- Save face crops
- Basic grouping (no embeddings yet, just create one person per image for now)
"""
from pathlib import Path
from typing import List, Tuple, Optional
import time
from PIL import Image
import logging

logger = logging.getLogger(__name__)

def detect_faces_simple(image_path: str) -> List[dict]:
    """
    Detect faces in an image (simplified version)
    
    For MVP, we'll use a simple approach:
    - Use DeepFace to detect faces
    - Return face bounding boxes
    
    Args:
        image_path: Path to the image file
        
    Returns:
        List of face dictionaries with bbox coordinates
    """
    try:
        from deepface import DeepFace
        
        # Detect faces using DeepFace
        faces = DeepFace.extract_faces(
            img_path=image_path,
            detector_backend='opencv',  # Fast detector
            enforce_detection=False  # Don't fail if no faces found
        )
        
        result = []
        for idx, face_data in enumerate(faces):
            if face_data.get('confidence', 0) > 0.5:  # Filter low confidence
                bbox = face_data.get('facial_area', {})
                result.append({
                    'index': idx,
                    'bbox_x': bbox.get('x', 0),
                    'bbox_y': bbox.get('y', 0),
                    'bbox_width': bbox.get('w', 0),
                    'bbox_height': bbox.get('h', 0),
                    'confidence': face_data.get('confidence', 0.0)
                })
        
        return result
        
    except Exception as e:
        logger.error(f"Face detection failed for {image_path}: {e}")
        return []


def save_face_crop(image_path: str, bbox: dict, output_path: str) -> bool:
    """
    Save a cropped face from an image
    
    Args:
        image_path: Path to source image
        bbox: Bounding box dict with x, y, width, height
        output_path: Path to save the cropped face
        
    Returns:
        True if successful, False otherwise
    """
    try:
        img = Image.open(image_path)
        
        # Crop the face region
        x = bbox['bbox_x']
        y = bbox['bbox_y']
        w = bbox['bbox_width']
        h = bbox['bbox_height']
        
        cropped = img.crop((x, y, x + w, y + h))
        
        # Convert RGBA to RGB if needed (for JPEG compatibility)
        if cropped.mode == 'RGBA':
            # Create a white background
            rgb_img = Image.new('RGB', cropped.size, (255, 255, 255))
            rgb_img.paste(cropped, mask=cropped.split()[3])  # Use alpha channel as mask
            cropped = rgb_img
        elif cropped.mode != 'RGB':
            cropped = cropped.convert('RGB')
        
        # Resize to a standard size for consistency
        cropped = cropped.resize((256, 256), Image.Resampling.LANCZOS)
        
        # Save
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        cropped.save(output_path, quality=95)
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to save face crop: {e}")
        return False


def extract_face_embedding(image_path: str, bbox: dict) -> Optional[bytes]:
    """
    Extract face embedding vector for similarity comparison
    
    Args:
        image_path: Path to source image
        bbox: Bounding box dict with x, y, width, height
        
    Returns:
        Embedding as bytes (512-d float64 array), or None if extraction fails
    """
    import tempfile
    import numpy as np
    
    try:
        # First crop the face region for better accuracy
        img = Image.open(image_path)
        x = bbox['bbox_x']
        y = bbox['bbox_y']
        w = bbox['bbox_width']
        h = bbox['bbox_height']
        
        cropped = img.crop((x, y, x + w, y + h))
        
        # Convert RGBA to RGB if needed
        if cropped.mode == 'RGBA':
            rgb_img = Image.new('RGB', cropped.size, (255, 255, 255))
            rgb_img.paste(cropped, mask=cropped.split()[3])
            cropped = rgb_img
        elif cropped.mode != 'RGB':
            cropped = cropped.convert('RGB')
        
        # Save to temp file for DeepFace
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            temp_path = tmp.name
            cropped.save(temp_path, quality=95)
        
        # Extract embedding using DeepFace
        from deepface import DeepFace
        
        result = DeepFace.represent(
            img_path=temp_path,
            model_name="Facenet512",  # 512-d embedding
            enforce_detection=False
        )
        
        # Clean up temp file
        Path(temp_path).unlink(missing_ok=True)
        
        # Convert to bytes for storage
        if result and len(result) > 0:
            embedding_array = np.array(result[0]["embedding"], dtype=np.float64)
            return embedding_array.tobytes()
        else:
            logger.warning("No embedding extracted")
            return None
            
    except Exception as e:
        logger.error(f"Failed to extract embedding: {e}")
        return None
