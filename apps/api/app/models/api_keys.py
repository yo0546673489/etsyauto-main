"""
API Keys Model for Service-to-Service Authentication
"""
from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, Text, ForeignKey, ARRAY
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class APIKey(Base):
    """
    API Key for service-to-service authentication
    
    Features:
    - Secure key hashing (SHA-256)
    - Role-based scopes
    - Tenant scoping
    - Expiration and revocation
    - Audit trail
    """
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Key identification
    key_hash = Column(String(64), unique=True, index=True, nullable=False)  # SHA-256 hash
    service_name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # Permissions
    scopes = Column(ARRAY(String), nullable=False)  # List of permission scopes
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Lifecycle
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True, index=True)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    replaced_by_id = Column(Integer, ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="api_keys")
    replaced_by = relationship("APIKey", remote_side=[id], foreign_keys=[replaced_by_id])
    
    def __repr__(self):
        return f"<APIKey(id={self.id}, service='{self.service_name}', tenant_id={self.tenant_id})>"
    
    @property
    def is_valid(self) -> bool:
        """Check if key is currently valid"""
        if self.revoked_at:
            return False
        
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        
        return True
    
    @property
    def days_until_expiry(self) -> Optional[int]:
        """Get days until expiration"""
        if not self.expires_at:
            return None
        
        delta = self.expires_at - datetime.utcnow()
        return max(0, delta.days)

