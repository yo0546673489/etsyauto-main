"""
Audit Logging Service
Centralized service for logging all significant actions in the system
"""
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import uuid
import time

from app.models.audit import AuditLog
from app.models.audit_constants import AuditAction, AuditStatus


class AuditService:
    """Service for creating and managing audit log entries"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def log_action(
        self,
        action: str,
        status: str,
        actor_user_id: Optional[int] = None,
        actor_email: Optional[str] = None,
        actor_ip: Optional[str] = None,
        tenant_id: Optional[int] = None,
        shop_id: Optional[int] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        http_method: Optional[str] = None,
        http_path: Optional[str] = None,
        http_status: Optional[int] = None,
        request_metadata: Optional[Dict[str, Any]] = None,
        response_metadata: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
        attempt: int = 1,
        latency_ms: Optional[int] = None,
        request_id: Optional[str] = None,
    ) -> AuditLog:
        """
        Create an audit log entry
        
        Args:
            action: Action identifier (use AuditAction constants)
            status: Status of the action (use AuditStatus constants)
            actor_user_id: ID of the user performing the action
            actor_email: Email of the actor
            actor_ip: IP address of the actor
            tenant_id: Tenant context
            shop_id: Shop context
            target_type: Type of resource being acted upon
            target_id: ID of the resource
            http_method: HTTP method (if applicable)
            http_path: HTTP path (if applicable)
            http_status: HTTP status code
            request_metadata: Sanitized request data
            response_metadata: Sanitized response data
            error_message: Error details if status is failure/error
            attempt: Retry attempt number
            latency_ms: Request duration in milliseconds
            request_id: Request correlation ID
        
        Returns:
            Created AuditLog instance
        """
        # Generate request_id if not provided
        if not request_id:
            request_id = str(uuid.uuid4())
        
        # Sanitize metadata
        sanitized_request = AuditLog.sanitize_metadata(request_metadata or {})
        sanitized_response = AuditLog.sanitize_metadata(response_metadata or {})
        
        # Create audit log entry
        audit_entry = AuditLog(
            request_id=request_id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            actor_ip=actor_ip,
            tenant_id=tenant_id,
            shop_id=shop_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            http_method=http_method,
            http_path=http_path,
            http_status=http_status,
            status=status,
            error_message=error_message,
            request_metadata=sanitized_request if sanitized_request else None,
            response_metadata=sanitized_response if sanitized_response else None,
            attempt=attempt,
            latency_ms=latency_ms,
            created_at=datetime.now(timezone.utc)
        )
        
        self.db.add(audit_entry)
        self.db.commit()
        self.db.refresh(audit_entry)
        
        return audit_entry
    
    def log_auth_event(
        self,
        action: str,
        email: str,
        user_id: Optional[int],
        ip_address: str,
        status: str,
        error_message: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> AuditLog:
        """Log authentication events (login, logout, register, etc.)"""
        return self.log_action(
            action=action,
            status=status,
            actor_user_id=user_id,
            actor_email=email,
            actor_ip=ip_address,
            error_message=error_message,
            request_id=request_id
        )
    
    def log_product_event(
        self,
        action: str,
        product_id: int,
        user_id: int,
        tenant_id: int,
        shop_id: Optional[int],
        status: str,
        request_metadata: Optional[Dict] = None,
        error_message: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> AuditLog:
        """Log product-related events (create, update, delete, import)"""
        return self.log_action(
            action=action,
            status=status,
            actor_user_id=user_id,
            tenant_id=tenant_id,
            shop_id=shop_id,
            target_type="product",
            target_id=str(product_id),
            request_metadata=request_metadata,
            error_message=error_message,
            request_id=request_id
        )
    
    
    def log_listing_event(
        self,
        action: str,
        listing_id: Optional[int],
        user_id: int,
        tenant_id: int,
        shop_id: int,
        status: str,
        attempt: int = 1,
        request_metadata: Optional[Dict] = None,
        response_metadata: Optional[Dict] = None,
        latency_ms: Optional[int] = None,
        error_message: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> AuditLog:
        """Log listing operations (publish, update, sync)"""
        return self.log_action(
            action=action,
            status=status,
            actor_user_id=user_id,
            tenant_id=tenant_id,
            shop_id=shop_id,
            target_type="listing",
            target_id=str(listing_id) if listing_id else None,
            attempt=attempt,
            request_metadata=request_metadata,
            response_metadata=response_metadata,
            latency_ms=latency_ms,
            error_message=error_message,
            request_id=request_id
        )
    
    def log_ingestion_event(
        self,
        action: str,
        batch_id: int,
        user_id: int,
        tenant_id: int,
        shop_id: Optional[int],
        status: str,
        request_metadata: Optional[Dict] = None,
        response_metadata: Optional[Dict] = None,
        error_message: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> AuditLog:
        """Log product ingestion events"""
        return self.log_action(
            action=action,
            status=status,
            actor_user_id=user_id,
            tenant_id=tenant_id,
            shop_id=shop_id,
            target_type="ingestion_batch",
            target_id=str(batch_id),
            request_metadata=request_metadata,
            response_metadata=response_metadata,
            error_message=error_message,
            request_id=request_id
        )
    
    def log_oauth_event(
        self,
        action: str,
        user_id: int,
        tenant_id: int,
        shop_id: Optional[int],
        status: str,
        provider: str = "etsy",
        error_message: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> AuditLog:
        """Log OAuth events (connect, disconnect, token refresh)"""
        return self.log_action(
            action=action,
            status=status,
            actor_user_id=user_id,
            tenant_id=tenant_id,
            shop_id=shop_id,
            target_type="oauth_token",
            request_metadata={"provider": provider},
            error_message=error_message,
            request_id=request_id
        )
    
    def log_schedule_event(
        self,
        action: str,
        schedule_id: int,
        user_id: int,
        tenant_id: int,
        status: str,
        request_metadata: Optional[Dict] = None,
        error_message: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> AuditLog:
        """Log schedule management events"""
        return self.log_action(
            action=action,
            status=status,
            actor_user_id=user_id,
            tenant_id=tenant_id,
            target_type="schedule",
            target_id=str(schedule_id),
            request_metadata=request_metadata,
            error_message=error_message,
            request_id=request_id
        )


def get_audit_service(db: Session) -> AuditService:
    """Dependency injection helper"""
    return AuditService(db)

