"""
SQLAlchemy Models - Audit Logging
"""
from datetime import datetime
from sqlalchemy import (
    Column, BigInteger, String, Text, Integer, DateTime,
    ForeignKey, Index,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class AuditLog(Base):
    """
    Audit log for tracking all significant actions in the system
    Retention: 30 days (TTL enforced by cleanup job)
    """
    __tablename__ = "audit_logs"

    # Primary key
    id = Column(BigInteger, primary_key=True, index=True)

    # Request identification
    request_id = Column(String(36), nullable=False, index=True)  # UUID for request correlation

    # Actor information
    actor_user_id = Column(BigInteger, ForeignKey('users.id', ondelete="SET NULL"), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    actor_ip = Column(String(45), nullable=True)  # IPv6 max length

    # Tenant/Shop scoping (for multi-tenancy)
    tenant_id = Column(BigInteger, ForeignKey('tenants.id', ondelete="SET NULL"), nullable=True, index=True)
    shop_id = Column(BigInteger, ForeignKey('shops.id', ondelete="SET NULL"), nullable=True, index=True)

    # Action details
    action = Column(String(100), nullable=False, index=True)  # e.g., 'auth.login', 'product.create'
    target_type = Column(String(50), nullable=True)  # e.g., 'product', 'listing', 'user'
    target_id = Column(String(100), nullable=True)  # ID of the target resource

    # HTTP request details
    http_method = Column(String(10), nullable=True)  # GET, POST, PUT, DELETE, etc.
    http_path = Column(String(500), nullable=True)  # /api/products/123
    http_status = Column(Integer, nullable=True)  # 200, 404, 500, etc.

    # Operation status
    status = Column(String(20), nullable=False, index=True)  # success, failure, pending, error
    error_message = Column(Text, nullable=True)  # Error details if status=failure/error

    # Metadata (no secrets!)
    request_metadata = Column(JSONB, nullable=True)  # Request params/body (sanitized)
    response_metadata = Column(JSONB, nullable=True)  # Response summary (sanitized)

    # Performance tracking
    attempt = Column(Integer, default=1)  # Retry attempt number
    latency_ms = Column(Integer, nullable=True)  # Request duration in milliseconds

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    # Indexes for common queries
    __table_args__ = (
        Index('idx_audit_tenant_created', 'tenant_id', 'created_at'),
        Index('idx_audit_actor_created', 'actor_user_id', 'created_at'),
        Index('idx_audit_action_created', 'action', 'created_at'),
        Index('idx_audit_status_created', 'status', 'created_at'),
    )

    def __repr__(self):
        return f"<AuditLog(id={self.id}, action={self.action}, actor={self.actor_email}, status={self.status})>"

    @classmethod
    def sanitize_metadata(cls, data: dict) -> dict:
        """
        Remove sensitive fields from metadata before logging
        """
        if not data:
            return {}

        sensitive_keys = [
            'password', 'secret', 'token', 'api_key', 'access_token',
            'refresh_token', 'authorization', 'cookie', 'session',
            'credit_card', 'ssn', 'cvv', 'pin'
        ]

        sanitized = {}
        for key, value in data.items():
            key_lower = key.lower()

            # Skip sensitive keys
            if any(sensitive in key_lower for sensitive in sensitive_keys):
                sanitized[key] = "[REDACTED]"
            # Recursively sanitize nested dicts
            elif isinstance(value, dict):
                sanitized[key] = cls.sanitize_metadata(value)
            # Truncate large strings
            elif isinstance(value, str) and len(value) > 1000:
                sanitized[key] = value[:1000] + "... [TRUNCATED]"
            else:
                sanitized[key] = value

        return sanitized
