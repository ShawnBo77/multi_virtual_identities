from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class Following(Base):
    __tablename__ = "followings"

    id = Column(Integer, primary_key=True)
    platform = Column(String, index=True, nullable=False)
    followed_user_id = Column(Integer, ForeignKey("instagram_users.id"), nullable=False)
    is_following = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    client = relationship("Client", back_populates="followings")

    followed_user = relationship("InstagramUser")
    __table_args__ = (UniqueConstraint("client_id", "platform", "followed_user_id", name="_client_platform_userid_uc"),)
