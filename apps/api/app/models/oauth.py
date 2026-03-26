"""
SQLAlchemy Models - OAuth Providers
"""
from datetime import datetime
from sqlalchemy import (
    Column, BigInteger, String, Text, DateTime,
    ForeignKey, Index
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class OAuthProvider(Base):
    """OAuth provider accounts linked to users"""
    __tablename__ = "oauth_providers"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(50), nullable=False)  # 'google', 'facebook', etc.
    provider_user_id = Column(Text, nullable=False)  # User ID from the provider
    email = Column(Text, nullable=False)
    name = Column(Text, nullable=True)
    picture = Column(Text, nullable=True)  # Profile picture URL

    # OAuth tokens (encrypted in production)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="oauth_providers")

    __table_args__ = (
        Index('idx_oauth_providers_user_id', 'user_id'),
        Index('idx_oauth_providers_provider_user_id', 'provider', 'provider_user_id', unique=True),
        Index('idx_oauth_providers_email', 'email'),
    )
