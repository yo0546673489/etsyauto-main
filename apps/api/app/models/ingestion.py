"""
Ingestion Batch Models
Track product ingestion batches with status and error reports
"""
from datetime import datetime
from sqlalchemy import (
    Column, BigInteger, String, Text, Integer, DateTime, 
    ForeignKey, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class IngestionBatch(Base):
    """Track product ingestion batches"""
    __tablename__ = "ingestion_batches"
    
    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(BigInteger, ForeignKey('tenants.id', ondelete="CASCADE"), nullable=False, index=True)
    shop_id = Column(BigInteger, ForeignKey('shops.id', ondelete="SET NULL"), nullable=True, index=True)
    
    # Batch metadata
    batch_id = Column(String(255), unique=True, nullable=False, index=True)
    filename = Column(String(500))
    file_type = Column(String(20), CheckConstraint("file_type IN ('csv','json')"), nullable=False)
    source = Column(String(50), default='upload')
    
    # Status tracking
    status = Column(
        String(20),
        CheckConstraint("status IN ('pending','processing','completed','failed','cancelled')"),
        default='pending',
        index=True
    )
    
    # Row counts
    total_rows = Column(Integer, default=0)
    successful_rows = Column(Integer, default=0)
    failed_rows = Column(Integer, default=0)
    
    # Error reporting
    error_report_path = Column(String(1000))  # Path to error CSV/JSON file
    error_report_url = Column(String(1000))   # Signed URL for error report download
    
    # Processing metadata
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    
    # File content stored temporarily (for processing)
    raw_data = Column(JSONB, nullable=True)  # Store parsed data for processing
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="ingestion_batches")
    shop = relationship("Shop", back_populates="ingestion_batches")
    
    __table_args__ = (
        Index('idx_ingestion_batch_tenant_status', 'tenant_id', 'status'),
        Index('idx_ingestion_batch_created', 'created_at'),
    )

