"""
Error Reporting Model
Stores structured errors for UI display and retry logic
"""
from sqlalchemy import Column, Integer, BigInteger, String, Text, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class ErrorReport(Base):
    """
    Structured error reporting for all operations
    
    Stores per-item errors with actionable messages and retry capability
    """
    __tablename__ = "error_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Context
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Item information
    item_id = Column(String(255), nullable=False, index=True)  # Product ID, Listing ID, Order ID, etc.
    item_type = Column(String(50), nullable=False, index=True)  # product, listing, order, ingestion
    
    # Error details
    error_type = Column(String(50), nullable=False, index=True)  # validation, api, policy, rate_limit, network
    error_code = Column(String(100), nullable=False)  # Specific error code
    error_message = Column(Text, nullable=False)  # Technical error message
    actionable_message = Column(Text, nullable=False)  # User-friendly next steps
    
    # Retry information
    retry_available = Column(Boolean, default=True)
    retry_count = Column(Integer, default=0)
    last_retry_at = Column(DateTime, nullable=True)
    max_retries = Column(Integer, default=3)
    
    # Status
    status = Column(String(20), nullable=False, default='pending', index=True)  # pending, retrying, failed, resolved
    
    # Metadata
    metadata = Column(JSON, nullable=True)  # Additional context (stack trace, request/response, etc.)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="error_reports")
    shop = relationship("Shop", back_populates="error_reports")
    user = relationship("User", back_populates="error_reports")
    
    def __repr__(self):
        return f"<ErrorReport(id={self.id}, item_type='{self.item_type}', error_type='{self.error_type}', status='{self.status}')>"
    
    @property
    def can_retry(self) -> bool:
        """Check if error can be retried"""
        return (
            self.retry_available and 
            self.status in ['pending', 'failed'] and
            self.retry_count < self.max_retries
        )
    
    def get_actionable_message(self) -> str:
        """
        Generate actionable message based on error type
        """
        messages = {
            'validation': f"Please check the item data and correct validation errors. {self.error_message}",
            'api': "There was an issue communicating with Etsy. This is usually temporary. Click 'Retry' to try again.",
            'policy': f"This item violates Etsy policies. {self.error_message}. Please update the item content and try again.",
            'rate_limit': "We've hit Etsy's rate limits. The system will automatically retry. You can also wait a few minutes and retry manually.",
            'network': "Network connection issue. Please check your internet connection and retry."
        }
        
        return messages.get(self.error_type, self.actionable_message)

