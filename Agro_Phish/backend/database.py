import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database/phishguard.db")

db_dir = os.path.dirname(DATABASE_URL.replace("sqlite:///", ""))
if not os.path.exists(db_dir):
    os.makedirs(db_dir)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_tables():
    """Создает все таблицы в базе данных"""
    Base.metadata.create_all(bind=engine)

def get_db():
    """Dependency для получения сессии базы данных"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


