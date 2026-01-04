from sqlalchemy.orm import Session
from ..models import client_model
from fastapi import HTTPException


def create_client(db: Session) -> client_model.Client:
    new_client = client_model.Client()
    db.add(new_client)
    db.commit()
    db.refresh(new_client)
    return new_client


def get_client(db: Session, client_id: int) -> client_model.Client:
    client = db.query(client_model.Client).filter(client_model.Client.id == client_id).first()
    if not client:
        raise HTTPException(
            status_code=401, detail=f"Unauthorized: Client with ID '{client_id}' not found. Please register first."
        )
    return client
