import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Boolean,
    UniqueConstraint,
    Enum as SAEnum,
    JSON,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base
from typing import List


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
    scrape_logs = relationship("InstagramScrapeLog", back_populates="target_user", cascade="all, delete-orphan")


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


class InstagramSavedPost(Base):
    __tablename__ = "instagram_saved_posts"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    post_id = Column(Integer, ForeignKey("instagram_posts.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    client = relationship("Client", back_populates="instagram_saved_posts")
    post = relationship("InstagramPost")

    __table_args__ = (UniqueConstraint("client_id", "post_id", name="_client_ig_post_saved_uc"),)


class ScrapeStatus(enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    NO_PK_FOUND = "no_pk_found"
    LOGIN_FAILED = "login_failed"


class CredentialStatus(str, enum.Enum):
    PENDING = "pending"  # Waiting for login attempt
    SUCCESS = "success"  # Logged in and cookies are valid
    LOGIN_FAILED = "login_failed"  # Password incorrect or generic login error
    CHALLENGE = "challenge"  # 2FA or Challenge required (Manual intervention needed)
    INACTIVE = "inactive"  # Manually disabled by user
    LOCKED = "locked"  # Identity banned or locked


class ClientInstagramCredential(Base):
    __tablename__ = "client_instagram_credentials"

    client_id = Column(Integer, ForeignKey("clients.id"), primary_key=True)
    credential_id = Column(Integer, ForeignKey("instagram_credentials.id"), primary_key=True)
    fetch_feed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    client = relationship("Client", back_populates="instagram_credential_links")
    credential = relationship("InstagramCredential", back_populates="client_links")


class InstagramCredential(Base):
    __tablename__ = "instagram_credentials"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=True)
    cookies = Column(JSON, nullable=True)  # Store Selenium cookies as JSON
    user_agent = Column(String, nullable=True)
    is_shared = Column(Boolean, default=False)
    status = Column(SAEnum(CredentialStatus), default=CredentialStatus.PENDING, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    client_links = relationship("ClientInstagramCredential", back_populates="credential", cascade="all, delete-orphan")
    category_links = relationship(
        "InstagramCredentialCategory", back_populates="credential", cascade="all, delete-orphan"
    )

    @property
    def categories(self) -> List[str]:
        return [cl.category.name for cl in self.category_links]


class InstagramCategory(Base):
    __tablename__ = "instagram_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    credential_links = relationship(
        "InstagramCredentialCategory", back_populates="category", cascade="all, delete-orphan"
    )


class InstagramCredentialCategory(Base):
    __tablename__ = "instagram_credential_categories"

    credential_id = Column(Integer, ForeignKey("instagram_credentials.id", ondelete="CASCADE"), primary_key=True)
    category_id = Column(Integer, ForeignKey("instagram_categories.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    credential = relationship("InstagramCredential", back_populates="category_links")
    category = relationship("InstagramCategory", back_populates="credential_links")


class InstagramScrapeLog(Base):
    __tablename__ = "instagram_scrape_logs"

    id = Column(Integer, primary_key=True, index=True)
    target_user_id = Column(Integer, ForeignKey("instagram_users.id"), nullable=False)
    credential_id = Column(Integer, ForeignKey("instagram_credentials.id"), nullable=False)
    status = Column(SAEnum(ScrapeStatus), default=ScrapeStatus.SUCCESS, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    target_user = relationship("InstagramUser", back_populates="scrape_logs")
    credential = relationship("InstagramCredential")


class InstagramHomeFeed(Base):
    __tablename__ = "instagram_home_feeds"

    id = Column(Integer, primary_key=True, index=True)
    credential_id = Column(Integer, ForeignKey("instagram_credentials.id"), nullable=False, index=True)
    post_id = Column(Integer, ForeignKey("instagram_posts.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    credential = relationship("InstagramCredential")
    post = relationship("InstagramPost")

    __table_args__ = (UniqueConstraint("credential_id", "post_id", name="_cred_post_home_feed_uc"),)
