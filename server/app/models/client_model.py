from sqlalchemy import Column, Integer, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    followings = relationship("Following", back_populates="client", cascade="all, delete-orphan")
