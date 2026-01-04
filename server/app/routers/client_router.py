from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..services import client_service
from ..schemas import client_schema
from ..database import SessionLocal

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/clients", response_model=client_schema.ClientCreateResponse, summary="Register a new client")
def register_new_client(db: Session = Depends(get_db)):
    """
    Creates a new client entry and returns its unique, server-generated ID.
    The extension should call this once on its first run and store the returned ID.
    """
    new_client = client_service.create_client(db)
    return new_client
