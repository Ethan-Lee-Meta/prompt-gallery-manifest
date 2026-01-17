"""
Library maintenance routes - /library/maintenance/* endpoints
"""
from fastapi import APIRouter
import logging

from library.services.face_processor import process_all_person_assets

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/library/maintenance")


@router.post("/process-faces")
def process_faces():
    """
    Manually trigger face detection for all person assets
    
    This will:
    - Find all person assets
    - Detect faces in each asset
    - Create person records and face instances
    """
    try:
        processed = process_all_person_assets()
        return {
            "status": "success",
            "assets_processed": processed,
            "message": f"Processed {processed} asset(s)"
        }
    except Exception as e:
        logger.error(f"Face processing failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }
