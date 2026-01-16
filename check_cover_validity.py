import sys
from sqlmodel import Session, select, create_engine
from app.models_library import Person, FaceInstance

sqlite_url = "sqlite:///../../.data/prompt-gallery-app.db"
engine = create_engine(sqlite_url)

def check_person_cover():
    with Session(engine) as session:
        people = session.exec(select(Person)).all()
        for p in people:
            print(f"Person: {p.display_name}, CoverID: {p.cover_face_id}")
            if p.cover_face_id:
                face = session.get(FaceInstance, p.cover_face_id)
                if face:
                    print(f"  -> Face Found: {face.id}, Path: {face.face_crop_relpath}")
                else:
                    print(f"  -> Face NOT FOUND in database!")

if __name__ == "__main__":
    check_person_cover()
