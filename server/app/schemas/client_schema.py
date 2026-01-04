from pydantic import BaseModel
from typing import List
from datetime import datetime


class ClientCreateResponse(BaseModel):
    id: int
    created_at: datetime


class Client(BaseModel):
    id: int
    created_at: datetime
    updated_at: datetime
    followings: List["Following"]

    class Config:
        from_attributes = True


class Following(BaseModel):
    id: int
    platform: str
    followed_pk: str

    class Config:
        from_attributes = True
