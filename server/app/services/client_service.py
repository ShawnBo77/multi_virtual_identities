import bcrypt
from sqlalchemy.orm import Session
from ..models import client_model
from ..schemas import client_schema
from fastapi import HTTPException


def create_client(db: Session, auth: client_schema.ClientAuth):
    existing = db.query(client_model.Client).filter(client_model.Client.username == auth.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")

    password_bytes = auth.password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password_bytes, salt).decode("utf-8")

    new_client = client_model.Client(username=auth.username, hashed_password=hashed_password)
    db.add(new_client)
    db.commit()
    db.refresh(new_client)
    return new_client


def authenticate_client(db: Session, auth: client_schema.ClientAuth):
    client = db.query(client_model.Client).filter(client_model.Client.username == auth.username).first()

    if not client:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user_password_bytes = auth.password.encode("utf-8")
    hashed_password_bytes = client.hashed_password.encode("utf-8")

    if not bcrypt.checkpw(user_password_bytes, hashed_password_bytes):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return client


def get_client(db: Session, client_id: int) -> client_model.Client:
    client = db.query(client_model.Client).filter(client_model.Client.id == client_id).first()
    if not client:
        raise HTTPException(
            status_code=401, detail=f"Unauthorized: Client with ID '{client_id}' not found. Please register first."
        )
    return client
