"""
User Preferences Model
Stores per-user display preferences including preferred currency.
"""
from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class UserPreference(Base):
    """User display preferences (currency, etc.)"""
    __tablename__ = "user_preferences"

    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    preferred_currency_code = Column(String(3), nullable=False, server_default="USD")
    last_updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="user_preference", uselist=False)
