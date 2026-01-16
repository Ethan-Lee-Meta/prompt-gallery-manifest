import sys
from sqlmodel import Session, select, create_engine
from app.models_library import Person, PersonRef, FaceInstance

# Explicitly use the active DB path
sqlite_url = "sqlite:///../../.data/prompt-gallery-app.db"
engine = create_engine(sqlite_url)

def fix_missing_covers():
    with Session(engine) as session:
        # Find people without cover face
        stmt = select(Person).where(Person.cover_face_id == None)
        people = session.exec(stmt).all()
        
        print(f"Found {len(people)} people without cover.")
        
        for p in people:
            # Try to find a reference face via PersonRef -> FaceInstance
            # OR just find ANY FaceInstance for this person?
            # Creating a person usually makes a PersonRef.
            
            # Strategy 1: Check PersonRef
            stmt_ref = select(PersonRef).where(PersonRef.person_id == p.id)
            refs = session.exec(stmt_ref).all()
            
            target_face_id = None
            if refs:
                target_face_id = refs[0].face_id
            else:
                # Strategy 2: Check FaceInstance linked to any asset of this person?
                # We don't have a direct link Person -> FaceInstance easily without join.
                # But FaceInstance has no person_id column in my memory? 
                # Wait, FaceInstance has asset_id. Asset has people list? No, asset.kind=person.
                # Actually earlier I saw `process_asset_faces` creates PersonRef.
                pass

            if target_face_id:
                print(f"Update person {p.display_name} cover to {target_face_id}")
                p.cover_face_id = target_face_id
                session.add(p)
            else:
                 # Fallback: manually find face for Detected Person 1 if we know the ID?
                 # Inspecting dump earlier: Face ID was F5339...
                 pass
        
        session.commit()
        print("Done.")

if __name__ == "__main__":
    fix_missing_covers()
