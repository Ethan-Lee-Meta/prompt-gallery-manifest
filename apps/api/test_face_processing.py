import logging
logging.basicConfig(level=logging.INFO)

from library.services.face_processor import process_all_person_assets

try:
    result = process_all_person_assets()
    print(f"Processed: {result} assets")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
