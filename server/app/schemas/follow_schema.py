from pydantic import BaseModel
from datetime import datetime


class FollowingData(BaseModel):
    followed_username: str


class Following(BaseModel):
    id: int
    followed_username: str
    platform: str
    is_following: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FollowedUser(BaseModel):
    followed_username: str
    is_following: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
