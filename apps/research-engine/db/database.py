# apps/new-store/db/database.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config import DATABASE_URL
from db.models import Base

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """יוצר את כל הטבלאות אם לא קיימות"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency להזרקת session ל-endpoints"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
