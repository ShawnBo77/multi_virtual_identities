from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

APP_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_ROOT_DIR = os.path.dirname(APP_DIR)
DB_PATH = os.path.join(SERVER_ROOT_DIR, "sql_app.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 10})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
