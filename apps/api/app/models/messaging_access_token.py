"""Messaging access activation tokens (admin-generated links)."""
from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Text, func

from app.core.database import Base


class MessagingAccessToken(Base):
    __tablename__ = "messaging_access_tokens"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token = Column(Text, unique=True, nullable=False)
    email = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
