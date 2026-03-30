from pydantic import BaseModel
from typing import List
from datetime import datetime


class Client(BaseModel):
    id: int
    created_at: datetime
    updated_at: datetime
    followings: List["Following"]

    class Config:
        from_attributes = True


class ClientCreateResponse(BaseModel):
    id: int
    username: str
    created_at: datetime


class ClientAuth(BaseModel):
    username: str
    password: str


class Following(BaseModel):
    id: int
    platform: str
    followed_pk: str

    class Config:
        from_attributes = True
