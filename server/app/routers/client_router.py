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


@router.post("/register", response_model=client_schema.ClientCreateResponse)
def register(auth: client_schema.ClientAuth, db: Session = Depends(get_db)):
    return client_service.create_client(db, auth)


@router.post("/login", response_model=client_schema.ClientCreateResponse)
def login(auth: client_schema.ClientAuth, db: Session = Depends(get_db)):
    return client_service.authenticate_client(db, auth)
