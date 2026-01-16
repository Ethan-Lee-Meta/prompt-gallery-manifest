from datetime import datetime
from typing import List, Optional
from sqlmodel import Session, select, func
from app.models_library import Asset, Person, FaceInstance, PersonRef
from app.util.ids import new_id

class LibraryDataService:
    def create_asset(self, session: Session, 
                     filename: str, 
                     storage_relpath: str,
                     thumb_relpath: Optional[str] = None,
                     kind: str = "unknown", 
                     source: Optional[str] = None) -> Asset:
        
        asset_id = new_id()
        asset = Asset(
            id=asset_id,
            filename=filename,
            storage_relpath=storage_relpath,
            thumb_relpath=thumb_relpath,
            kind=kind,
            source=source,
            created_at=int(datetime.utcnow().timestamp() * 1000)
        )
        session.add(asset)
        session.commit()
        session.refresh(asset)
        return asset

    def list_assets(self, session: Session, 
                    kind: Optional[str] = None, 
                    limit: int = 50, 
                    offset: int = 0) -> List[Asset]:
        stmt = select(Asset)
        if kind:
            stmt = stmt.where(Asset.kind == kind)
        stmt = stmt.order_by(Asset.created_at.desc()).offset(offset).limit(limit)
        return session.exec(stmt).all()
        
    def count_assets(self, session: Session, kind: Optional[str] = None) -> int:
        stmt = select(func.count()).select_from(Asset)
        if kind:
            stmt = stmt.where(Asset.kind == kind)
        return session.exec(stmt).one()

    def get_asset(self, session: Session, asset_id: str) -> Optional[Asset]:
        return session.get(Asset, asset_id)

    # --- Person operations ---
    
    def list_people(self, session: Session, 
                    status: Optional[str] = None, 
                    limit: int = 50, 
                    offset: int = 0) -> List[Person]:
        stmt = select(Person)
        if status:
            stmt = stmt.where(Person.status == status)
        
        # Sort by face count desc, then created desc
        stmt = stmt.order_by(Person.faces_count.desc(), Person.created_at.desc()).offset(offset).limit(limit)
        return session.exec(stmt).all()

    def get_person(self, session: Session, person_id: str) -> Optional[Person]:
        return session.get(Person, person_id)

    def create_person(self, session: Session, name: str) -> Person:
        pid = new_id()
        p = Person(
            id=pid, 
            display_name=name,
            status="Needs Review",
            confidence=0.8,
            faces_count=0,
            assets_count=0,
            created_at=int(datetime.utcnow().timestamp() * 1000)
        )
        session.add(p)
        session.commit()
        session.refresh(p)
        return p

    def process_asset_faces(self, session: Session, asset: Asset):
        """
        MVP/Stub: Blindly assume every image has a face and assign to "Person 1" or create if missing.
        Real impl would use face_recognition or onnx model here.
        """
        # 1. Ensure at least one person exists
        people = self.list_people(session, limit=1)
        if not people:
            target_person = self.create_person(session, "Detected Person 1")
        else:
            target_person = people[0]
        
        # 2. Update person stats
        target_person.faces_count += 1
        target_person.assets_count += 1
        
        # 3. Create FaceInstance
        face = FaceInstance(
            id=new_id(),
            asset_id=asset.id,
            bbox_x=0, bbox_y=0, bbox_w=100, bbox_h=100,
            face_crop_relpath=asset.storage_relpath, # Use full image as crop for MVP
            bucket="frontal",
            quality_score=0.9,
            yaw=0, pitch=0, roll=0,
            excluded=False,
            pinned=False,
            created_at=int(datetime.utcnow().timestamp() * 1000)
        )
        session.add(face)

        # 4. Link PersonRef (relationship mapping)
        # Note: PersonRef table key is (person_id, bucket)
        # Since simple MVP, we just ensure the Ref exists
        ref = session.get(PersonRef, (target_person.id, "frontal"))
        if not ref:
            ref = PersonRef(
                person_id=target_person.id,
                bucket="frontal",
                face_id=face.id,
                selected_by="auto",
                selected_at=int(datetime.utcnow().timestamp() * 1000)
            )
            session.add(ref)

        # 5. Update Asset
        asset.kind = "person"
        session.add(asset)
        
        # 6. Update Person Cover if needed
        if not target_person.cover_face_id:
            target_person.cover_face_id = face.id
        session.add(target_person)

        session.commit()

library_data = LibraryDataService()
