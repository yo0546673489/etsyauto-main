"""
SQLAlchemy Models - Webhook Events
"""
from datetime import datetime
from sqlalchemy import (
    Column, BigInteger, String, DateTime, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class WebhookEvent(Base):
    """Webhook events from external services"""
    __tablename__ = "webhook_events"

    id = Column(BigInteger, primary_key=True, index=True)
    provider = Column(String(50))
    external_id = Column(String(255), unique=True)

    payload = Column(JSONB)
    received_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    processed_at = Column(DateTime(timezone=True))
    status = Column(
        String(20),
        CheckConstraint("status IN ('pending','processed','skipped')"),
        default='pending'
    )
