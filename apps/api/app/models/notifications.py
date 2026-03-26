"""
Notification Models
"""

from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from app.core.database import Base


class NotificationType(str, enum.Enum):
    """Notification types"""
    INFO = "INFO"
    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"
    ORDER = "ORDER"
    LISTING = "LISTING"
    TEAM = "TEAM"
    SYSTEM = "SYSTEM"


class Notification(Base):
    """
    User notifications

    Examples:
    - Order received
    - Listing published successfully
    - Listing failed
    - System maintenance
    - Team member invited
    - Shop connected/disconnected
    """
    __tablename__ = "notifications"

    id = Column(BigInteger, primary_key=True, index=True)

    # User and tenant (changed to BigInteger to match User and Tenant models)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    # Notification content
    type = Column(SQLEnum(NotificationType), nullable=False, default=NotificationType.INFO)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)

    # Action link (optional)
    action_url = Column(String(500), nullable=True)
    action_label = Column(String(100), nullable=True)

    # Metadata
    read = Column(Boolean, default=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="notifications")
    tenant = relationship("Tenant", back_populates="notifications")

    def __repr__(self):
        return f"<Notification(id={self.id}, type={self.type}, title='{self.title}', read={self.read})>"
