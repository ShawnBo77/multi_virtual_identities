from pydantic import BaseModel, computed_field
from typing import List, Optional
from datetime import datetime


class InstagramUserBase(BaseModel):
    pk: Optional[str] = None
    username: str
    full_name: Optional[str] = None
    profile_pic_url: Optional[str] = None
    profile_pic_local_path: Optional[str] = None
    last_scraped_at: Optional[datetime] = None
    is_verified: bool = False


class InstagramUserCreate(InstagramUserBase):
    pass


class InstagramMediaBase(BaseModel):
    pk: str
    media_type: int
    image_local_path: Optional[str] = None
    video_local_path: Optional[str] = None


class InstagramMediaCreate(InstagramMediaBase):
    pass


class InstagramPostBase(BaseModel):
    pk: str
    code: str
    caption_text: Optional[str] = None
    taken_at: datetime
    like_count: int
    comment_count: int
    media_type: int


class InstagramPostCreate(InstagramPostBase):
    pass


class InstagramUser(InstagramUserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def profile_pic_local_url(self) -> Optional[str]:
        if self.profile_pic_local_path:
            return f"http://127.0.0.1:8000/{self.profile_pic_local_path}"
        return None

    class Config:
        from_attributes = True


class InstagramUserBrief(InstagramUserBase):
    id: int

    @computed_field
    @property
    def profile_pic_local_url(self) -> Optional[str]:
        if self.profile_pic_local_path:
            return f"http://127.0.0.1:8000/{self.profile_pic_local_path}"
        return None

    class Config:
        from_attributes = True


class InstagramMedia(InstagramMediaBase):
    id: int
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def image_local_url(self) -> Optional[str]:
        """Dynamically creates the full URL for the local image file."""
        if self.image_local_path:
            path = self.image_local_path.replace("\\", "/")
            return f"http://127.0.0.1:8000/{path}"
        return None

    @computed_field
    @property
    def video_local_url(self) -> Optional[str]:
        """Dynamically creates the full URL for the local video file."""
        if self.video_local_path:
            path = self.video_local_path.replace("\\", "/")
            return f"http://127.0.0.1:8000/{path}"
        return None

    class Config:
        from_attributes = True


class InstagramMediaBrief(InstagramMediaBase):
    id: int

    @computed_field
    @property
    def image_local_url(self) -> Optional[str]:
        """Dynamically creates the full URL for the local image file."""
        if self.image_local_path:
            path = self.image_local_path.replace("\\", "/")
            return f"http://127.0.0.1:8000/{path}"
        return None

    @computed_field
    @property
    def video_local_url(self) -> Optional[str]:
        """Dynamically creates the full URL for the local video file."""
        if self.video_local_path:
            path = self.video_local_path.replace("\\", "/")
            return f"http://127.0.0.1:8000/{path}"
        return None

    class Config:
        from_attributes = True


class InstagramPost(InstagramPostBase):
    id: int
    owner: InstagramUser
    media_items: List[InstagramMedia]
    created_at: datetime
    updated_at: datetime
    is_saved: Optional[bool] = False

    class Config:
        from_attributes = True


class InstagramPostBrief(InstagramPostBase):
    id: int
    owner: InstagramUserBrief
    media_items: List[InstagramMediaBrief]
    is_saved: Optional[bool] = False

    class Config:
        from_attributes = True


class InstagramSavedPostResponse(BaseModel):
    id: int
    code: str
    thumbnail_local_path: Optional[str] = None

    @computed_field
    @property
    def thumbnail_url(self) -> Optional[str]:
        if self.thumbnail_local_path:
            path = self.thumbnail_local_path.replace("\\", "/")
            return f"http://127.0.0.1:8000/{path}"
        return None

    class Config:
        from_attributes = True


class CredentialCreate(BaseModel):
    username: str
    password: str
    is_global: bool = False
    fetch_feed: bool = False


class CredentialResponse(BaseModel):
    id: int
    username: str
    status: str
    last_used_at: Optional[datetime] = None
    is_global: bool = False
    fetch_feed: bool = False

    class Config:
        from_attributes = True


class CredentialSettingsUpdate(BaseModel):
    fetch_feed: bool
