from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class InstagramUser(Base):
    __tablename__ = "instagram_users"

    id = Column(Integer, primary_key=True, index=True)
    pk = Column(String, unique=True, index=True, nullable=True)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    profile_pic_url = Column(String, nullable=True)
    profile_pic_local_path = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    last_scraped_at = Column(DateTime, nullable=True, default=None)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    posts = relationship("InstagramPost", back_populates="owner")


class InstagramPost(Base):
    __tablename__ = "instagram_posts"

    id = Column(Integer, primary_key=True, index=True)
    pk = Column(String, unique=True, index=True, nullable=False)
    code = Column(String, unique=True)
    caption_text = Column(Text, nullable=True)
    taken_at = Column(DateTime, nullable=False)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    media_type = Column(Integer)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    owner_id = Column(Integer, ForeignKey("instagram_users.id"))
    owner = relationship("InstagramUser", back_populates="posts")
    media_items = relationship("InstagramMedia", back_populates="post", cascade="all, delete-orphan")


class InstagramMedia(Base):
    __tablename__ = "instagram_media"

    id = Column(Integer, primary_key=True, index=True)
    pk = Column(String, unique=True, index=True, nullable=False)
    media_type = Column(Integer)
    image_url = Column(String, nullable=True)
    video_url = Column(String, nullable=True)
    image_local_path = Column(String, nullable=True)
    video_local_path = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    post_id = Column(Integer, ForeignKey("instagram_posts.id"))
    post = relationship("InstagramPost", back_populates="media_items")


class InstagramFeedHistory(Base):
    __tablename__ = "instagram_feed_history"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    post_id = Column(Integer, ForeignKey("instagram_posts.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("client_id", "post_id", name="_client_ig_post_uc"),)
