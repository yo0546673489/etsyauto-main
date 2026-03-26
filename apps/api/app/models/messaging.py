from datetime import datetime, timezone

from sqlalchemy import BigInteger, CheckConstraint, Column, DateTime, ForeignKey, Text

from app.core.database import Base


class MessageThread(Base):
    __tablename__ = "message_threads"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id"), nullable=False, index=True)
    shop_id = Column(BigInteger, ForeignKey("shops.id"), nullable=False, index=True)
    etsy_conversation_url = Column(Text, nullable=False)
    customer_name = Column(Text, nullable=True)
    customer_message = Column(Text, nullable=True)
    status = Column(
        Text,
        nullable=False,
        server_default="pending_read",
    )
    replied_text = Column(Text, nullable=True)
    replied_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_read','unread','replied','failed')",
            name="ck_message_threads_status",
        ),
    )

