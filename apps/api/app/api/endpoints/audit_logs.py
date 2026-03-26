"""
Audit Log API Endpoints
View and query audit logs with tenant-scoping and pagination
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, or_
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel

from app.api.dependencies import get_user_context, UserContext, require_permission
from app.core.database import get_db
from app.core.rbac import Permission
from app.core.query_helpers import filter_by_tenant
from app.models.audit import AuditLog
from app.models.audit_constants import AuditAction, AuditStatus

router = APIRouter()


# ==================== Request/Response Models ====================

class AuditLogResponse(BaseModel):
    id: int
    request_id: str
    actor_user_id: Optional[int]
    actor_email: Optional[str]
    actor_ip: Optional[str]
    tenant_id: Optional[int]
    shop_id: Optional[int]
    action: str
    target_type: Optional[str]
    target_id: Optional[str]
    http_method: Optional[str]
    http_path: Optional[str]
    http_status: Optional[int]
    status: str
    error_message: Optional[str]
    request_metadata: Optional[dict]
    response_metadata: Optional[dict]
    attempt: int
    latency_ms: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogsListResponse(BaseModel):
    logs: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AuditStatsResponse(BaseModel):
    total_actions: int
    success_count: int
    failure_count: int
    error_count: int
    avg_latency_ms: Optional[float]
    top_actions: List[dict]
    top_actors: List[dict]
    actions_by_status: dict


# ==================== API Endpoints ====================

@router.get("/", tags=["Audit Logs"])
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action: Optional[str] = None,
    status: Optional[str] = None,
    actor_email: Optional[str] = None,
    shop_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOGS)),
    db: Session = Depends(get_db)
) -> AuditLogsListResponse:
    """
    Get paginated list of audit logs for the tenant
    Requires: READ_AUDIT_LOGS permission (Admin+)
    
    Filters:
        - action: Filter by action type
        - status: Filter by status (success/failure/error)
        - actor_email: Filter by actor email
        - shop_id: Filter by shop
        - date_from/date_to: Filter by date range
    """
    # Base query with tenant filtering
    query = filter_by_tenant(db.query(AuditLog), context.tenant_id, AuditLog.tenant_id)
    
    # Apply filters
    filters = []
    
    if action:
        filters.append(AuditLog.action == action)
    
    if status:
        filters.append(AuditLog.status == status)
    
    if actor_email:
        filters.append(AuditLog.actor_email.ilike(f"%{actor_email}%"))
    
    if shop_id:
        filters.append(AuditLog.shop_id == shop_id)
    
    if date_from:
        filters.append(AuditLog.created_at >= date_from)
    
    if date_to:
        filters.append(AuditLog.created_at <= date_to)
    
    # Apply all filters
    if filters:
        query = query.filter(and_(*filters))
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * page_size
    logs = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size).all()
    
    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size
    
    return AuditLogsListResponse(
        logs=[AuditLogResponse.from_orm(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/stats", tags=["Audit Logs"])
async def get_audit_stats(
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    shop_id: Optional[int] = None,
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOGS)),
    db: Session = Depends(get_db)
) -> AuditStatsResponse:
    """
    Get audit log statistics for the tenant
    Requires: READ_AUDIT_LOGS permission (Admin+)
    """
    # Default date range: last 30 days
    if not date_from:
        date_from = datetime.now(timezone.utc) - timedelta(days=30)
    if not date_to:
        date_to = datetime.now(timezone.utc)
    
    # Base query
    query = filter_by_tenant(db.query(AuditLog), context.tenant_id, AuditLog.tenant_id)
    if shop_id:
        query = query.filter(AuditLog.shop_id == shop_id)
    query = query.filter(AuditLog.created_at >= date_from, AuditLog.created_at <= date_to)
    
    # Total actions
    total_actions = query.count()
    
    # Counts by status
    success_count = query.filter(AuditLog.status == AuditStatus.SUCCESS).count()
    failure_count = query.filter(AuditLog.status == AuditStatus.FAILURE).count()
    error_count = query.filter(AuditLog.status == AuditStatus.ERROR).count()
    
    # Average latency
    latencies = [log.latency_ms for log in query.all() if log.latency_ms is not None]
    avg_latency_ms = sum(latencies) / len(latencies) if latencies else None
    
    # Top actions
    from sqlalchemy import func
    top_actions_query = db.query(
        AuditLog.action,
        func.count(AuditLog.id).label('count')
    ).filter(
        AuditLog.tenant_id == context.tenant_id,
        AuditLog.created_at >= date_from,
        AuditLog.created_at <= date_to
    )
    if shop_id:
        top_actions_query = top_actions_query.filter(AuditLog.shop_id == shop_id)
    top_actions = top_actions_query.group_by(AuditLog.action).order_by(desc('count')).limit(10).all()
    
    # Top actors
    top_actors_query = db.query(
        AuditLog.actor_email,
        func.count(AuditLog.id).label('count')
    ).filter(
        AuditLog.tenant_id == context.tenant_id,
        AuditLog.created_at >= date_from,
        AuditLog.created_at <= date_to,
        AuditLog.actor_email.isnot(None)
    )
    if shop_id:
        top_actors_query = top_actors_query.filter(AuditLog.shop_id == shop_id)
    top_actors = top_actors_query.group_by(AuditLog.actor_email).order_by(desc('count')).limit(10).all()
    
    return AuditStatsResponse(
        total_actions=total_actions,
        success_count=success_count,
        failure_count=failure_count,
        error_count=error_count,
        avg_latency_ms=round(avg_latency_ms, 2) if avg_latency_ms else None,
        top_actions=[{"action": a, "count": c} for a, c in top_actions],
        top_actors=[{"email": e, "count": c} for e, c in top_actors],
        actions_by_status={
            "success": success_count,
            "failure": failure_count,
            "error": error_count,
        }
    )


@router.get("/{audit_id}", tags=["Audit Logs"])
async def get_audit_log(
    audit_id: int,
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOGS)),
    db: Session = Depends(get_db)
) -> AuditLogResponse:
    """
    Get a specific audit log entry
    Requires: READ_AUDIT_LOGS permission (Admin+)
    """
    log = db.query(AuditLog).filter(
        AuditLog.id == audit_id,
        AuditLog.tenant_id == context.tenant_id
    ).first()
    
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    return AuditLogResponse.from_orm(log)


@router.get("/actions/list", tags=["Audit Logs"])
async def list_available_actions(
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOGS)),
    db: Session = Depends(get_db)
) -> dict:
    """
    Get list of all available action types
    Requires: READ_AUDIT_LOGS permission (Admin+)
    """
    # Get unique actions from the tenant's audit logs
    actions = db.query(AuditLog.action).filter(
        AuditLog.tenant_id == context.tenant_id
    ).distinct().all()
    
    action_list = [action[0] for action in actions]
    
    # Also include standard actions from AuditAction class
    standard_actions = [
        attr_value for attr_name, attr_value in vars(AuditAction).items()
        if not attr_name.startswith('_') and isinstance(attr_value, str)
    ]
    
    return {
        "actions_used": sorted(action_list),
        "standard_actions": sorted(standard_actions),
        "total_unique_actions": len(action_list)
    }


@router.delete("/cleanup", tags=["Audit Logs"])
async def trigger_audit_cleanup(
    context: UserContext = Depends(require_permission(Permission.MANAGE_AUDIT_LOGS)),
    db: Session = Depends(get_db)
) -> dict:
    """
    Manually trigger audit log cleanup (30-day retention)
    Requires: MANAGE_AUDIT_LOGS permission (Owner only)
    
    WARNING: This will delete all audit logs older than 30 days
    """
    from app.worker.tasks.audit_cleanup import cleanup_old_audit_logs
    
    # Trigger cleanup task
    task = cleanup_old_audit_logs.delay()
    
    return {
        "message": "Audit log cleanup triggered",
        "task_id": task.id,
        "retention_days": 30
    }


@router.get("/retention/stats", tags=["Audit Logs"])
async def get_retention_stats(
    context: UserContext = Depends(require_permission(Permission.READ_AUDIT_LOGS)),
    db: Session = Depends(get_db)
) -> dict:
    """
    Get audit log retention statistics
    Requires: READ_AUDIT_LOGS permission (Admin+)
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
    
    # Total logs for tenant
    total_logs = db.query(AuditLog).filter(AuditLog.tenant_id == context.tenant_id).count()
    
    # Logs within retention
    logs_within_retention = db.query(AuditLog).filter(
        AuditLog.tenant_id == context.tenant_id,
        AuditLog.created_at >= cutoff_date
    ).count()
    
    # Logs beyond retention (should be 0 after cleanup)
    logs_beyond_retention = db.query(AuditLog).filter(
        AuditLog.tenant_id == context.tenant_id,
        AuditLog.created_at < cutoff_date
    ).count()
    
    # Oldest log for tenant
    oldest_log = db.query(AuditLog).filter(
        AuditLog.tenant_id == context.tenant_id
    ).order_by(AuditLog.created_at.asc()).first()
    
    # Newest log for tenant
    newest_log = db.query(AuditLog).filter(
        AuditLog.tenant_id == context.tenant_id
    ).order_by(AuditLog.created_at.desc()).first()
    
    return {
        "retention_days": 30,
        "cutoff_date": cutoff_date.isoformat(),
        "total_logs": total_logs,
        "logs_within_retention": logs_within_retention,
        "logs_beyond_retention": logs_beyond_retention,
        "oldest_log_date": oldest_log.created_at.isoformat() if oldest_log else None,
        "newest_log_date": newest_log.created_at.isoformat() if newest_log else None,
        "retention_percentage": round((logs_within_retention / total_logs * 100), 2) if total_logs > 0 else 0
    }

