# apps/new-store/db/models.py

from sqlalchemy import Column, String, Integer, JSON, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class ResearchJob(Base):
    """עוקב אחרי מחקר — גיבוי אם WebSocket נפל"""
    __tablename__ = "research_jobs"

    job_id       = Column(String, primary_key=True)
    status       = Column(String, default="pending")
    progress     = Column(Integer, default=0)
    current_step = Column(String, default="")
    params       = Column(JSON)           # price_min, max, category
    niche        = Column(JSON)           # התת-נישה שנבחרה
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow)


class ReadyProduct(Base):
    """מוצר מוכן — נשמר גם אם WebSocket נתנתק"""
    __tablename__ = "ready_products"

    id          = Column(String, primary_key=True)
    job_id      = Column(String)
    title       = Column(String)
    tags        = Column(JSON)         # list של 13 תגים
    description = Column(String)
    images      = Column(JSON)         # list של 5 URLs
    price       = Column(Integer)
    niche       = Column(String)
    sent_to_ui  = Column(Boolean, default=False)
    uploaded    = Column(Boolean, default=False)  # האם עלה לEtsy
    created_at  = Column(DateTime, default=datetime.utcnow)
