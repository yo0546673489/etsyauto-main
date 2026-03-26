"""
Audit Logs API Endpoints
Track and retrieve audit trail of user actions
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel

from app.api.dependencies import get_user_context, UserContext, require_permission
from app.core.database import get_db
from app.core.rbac import Permission
from app.core.query_helpers import filter_by_tenant, ensure_tenant_access
from app.models.audit import AuditLog

router = APIRouter()


# Response Models
class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    tenant_id: int
    action: str
    resource_type: str
    resource_id: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    request_id: Optional[str]
    diff: Optional[dict]
    status_code: Optional[int]
    latency_ms: Optional[int]
    created_at: str

    class Config:
        from_attributes = True


class AuditStatsResponse(BaseModel):
    total_events: int
    unique_users: int
    events_today: int
    events_this_week: int
    top_actions: List[dict]


@router.get("/", tags=["Audit Logs"])
async def get_audit_logs(
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOG)),
    db: Session = Depends(get_db)
):
    """
    Get audit logs for the current tenant
    Requires: READ_AUDIT_LOG permission (Owner, Viewer)
    
    Args:
        action: Optional filter by action (e.g., 'create', 'update', 'delete')
        resource_type: Optional filter by resource type (e.g., 'product', 'order', 'user')
        user_id: Optional filter by user ID
        start_date: Optional filter by start date (ISO format)
        end_date: Optional filter by end date (ISO format)
        skip: Number of records to skip
        limit: Maximum number of records to return
    
    Returns:
        List of audit log entries
    """
    # Filter by tenant
    query = filter_by_tenant(db.query(AuditLog), context.tenant_id, AuditLog.tenant_id)
    
    if action:
        query = query.filter(AuditLog.action == action)
    
    if resource_type:
        query = query.filter(AuditLog.target_type == resource_type)
    
    if user_id:
        query = query.filter(AuditLog.actor_id == str(user_id))
    
    if start_date:
        try:
            start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(AuditLog.created_at >= start)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format")
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(AuditLog.created_at <= end)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format")
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    logs = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()
    
    # Format response
    log_list = []
    for log in logs:
        log_list.append({
            "id": log.id,
            "shop_id": log.shop_id,
            "tenant_id": log.tenant_id,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "request_id": log.request_id,
            "diff": log.diff,
            "status_code": log.status_code,
            "latency_ms": log.latency_ms,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    
    return {
        "logs": log_list,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/stats", tags=["Audit Logs"])
async def get_audit_stats(
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOG)),
    db: Session = Depends(get_db)
):
    """
    Get audit log statistics for the current tenant
    Requires: READ_AUDIT_LOG permission (Owner, Viewer)
    
    Returns:
        Statistics about audit events
    """
    # Filter by tenant
    base_query = filter_by_tenant(db.query(AuditLog), context.tenant_id, AuditLog.tenant_id)
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)

    # Total events
    total_events = base_query.count()

    # Unique users (from actor_id)
    unique_users = db.query(func.count(func.distinct(AuditLog.actor_id))).filter(
        AuditLog.tenant_id == context.tenant_id
    ).scalar() or 0

    # Events today
    events_today = base_query.filter(AuditLog.created_at >= today_start).count()

    # Events this week
    events_this_week = base_query.filter(AuditLog.created_at >= week_start).count()

    # Top actions
    top_actions_query = db.query(
        AuditLog.action,
        func.count(AuditLog.id).label('count')
    ).filter(
        AuditLog.tenant_id == context.tenant_id
    ).group_by(AuditLog.action).order_by(desc('count')).limit(5).all()

    top_actions = [
        {"action": action, "count": count}
        for action, count in top_actions_query
    ]

    return {
        "total_events": total_events,
        "unique_users": unique_users,
        "events_today": events_today,
        "events_this_week": events_this_week,
        "top_actions": top_actions
    }


@router.post("/", tags=["Audit Logs"])
async def create_audit_log(
    request: "Request",
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    request_id: Optional[str] = None,
    diff: Optional[dict] = None,
    status_code: Optional[int] = None,
    latency_ms: Optional[int] = None,
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOG)),
    db: Session = Depends(get_db)
):
    """
    Create a new audit log entry.
    Requires: READ_AUDIT_LOG permission (Owner, Admin only).
    
    IP address and user agent are always extracted server-side
    to prevent spoofing.
    
    Args:
        action: Action performed (e.g., 'create', 'update', 'delete', 'login', 'logout')
        resource_type: Type of resource (e.g., 'product', 'order', 'user', 'shop')
        resource_id: ID of the resource affected
        request_id: Request ID for tracking
        diff: Changes made (before/after)
        status_code: HTTP status code
        latency_ms: Request latency in milliseconds
    
    Returns:
        Created audit log entry
    """
    new_log = AuditLog(
        actor_type='user',
        actor_id=str(context.user_id),
        tenant_id=context.tenant_id,
        action=action,
        target_type=resource_type,
        target_id=resource_id,
        request_id=request_id,
        diff=diff,
        status_code=status_code,
        latency_ms=latency_ms
    )

    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    return {
        "id": new_log.id,
        "message": "Audit log created successfully"
    }


@router.get("/{log_id}", tags=["Audit Logs"])
async def get_audit_log(
    log_id: int,
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOG)),
    db: Session = Depends(get_db)
):
    """
    Get a specific audit log entry by ID
    Requires: READ_AUDIT_LOG permission (Owner, Viewer)
    
    Args:
        log_id: ID of the audit log
    
    Returns:
        Audit log details
    """
    log = db.query(AuditLog).filter(
        AuditLog.id == log_id,
        AuditLog.tenant_id == context.tenant_id
    ).first()

    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")

    ensure_tenant_access(log.tenant_id, context)

    return {
        "id": log.id,
        "shop_id": log.shop_id,
        "tenant_id": log.tenant_id,
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "request_id": log.request_id,
        "diff": log.diff,
        "status_code": log.status_code,
        "latency_ms": log.latency_ms,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }
