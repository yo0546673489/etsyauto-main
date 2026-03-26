"""
Error Reporting API
Provides structured error reporting with filters, retry, and CSV export
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.tenancy import User
from app.models.errors import ErrorReport
from pydantic import BaseModel


router = APIRouter()


class ErrorItemResponse(BaseModel):
    id: int
    item_id: str
    item_type: str
    error_type: str
    error_code: str
    error_message: str
    actionable_message: str
    retry_available: bool
    status: str
    created_at: datetime
    metadata: Optional[dict] = None

    class Config:
        from_attributes = True


class RetryResponse(BaseModel):
    success: bool
    message: str


@router.get("/", response_model=List[ErrorItemResponse])
async def list_errors(
    item_type: Optional[str] = Query(None),
    error_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of errors with filtering
    
    Filters:
    - item_type: product, listing, order, ingestion
    - error_type: validation, api, policy, rate_limit, network
    - status: pending, retrying, failed, resolved
    - search: Search by item_id or error_message
    """
    query = db.query(ErrorReport).filter(ErrorReport.tenant_id == current_user.tenant_id)
    
    if item_type and item_type != 'all':
        query = query.filter(ErrorReport.item_type == item_type)
    
    if error_type and error_type != 'all':
        query = query.filter(ErrorReport.error_type == error_type)
    
    if status and status != 'all':
        query = query.filter(ErrorReport.status == status)
    
    if search:
        query = query.filter(
            (ErrorReport.item_id.ilike(f'%{search}%')) |
            (ErrorReport.error_message.ilike(f'%{search}%'))
        )
    
    errors = query.order_by(ErrorReport.created_at.desc()).limit(100).all()
    
    return errors


@router.post("/{error_id}/retry", response_model=RetryResponse)
async def retry_error(
    error_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retry a failed operation
    """
    error = db.query(ErrorReport).filter(
        ErrorReport.id == error_id,
        ErrorReport.tenant_id == current_user.tenant_id
    ).first()
    
    if not error:
        raise HTTPException(status_code=404, detail="Error not found")
    
    if not error.retry_available:
        raise HTTPException(status_code=400, detail="Retry not available for this error")
    
    # Update status to retrying
    error.status = 'retrying'
    error.retry_count = (error.retry_count or 0) + 1
    error.last_retry_at = datetime.utcnow()
    db.commit()
    
    # Trigger retry based on item type
    from app.worker.tasks.order_tasks import retry_order_sync
    from app.worker.tasks.ingestion_tasks import retry_ingestion_row

    if error.item_type == 'order':
        retry_order_sync.delay(error.item_id, error_id=error.id)
    elif error.item_type == 'ingestion':
        retry_ingestion_row.delay(error.item_id, error_id=error.id)
    
    return RetryResponse(
        success=True,
        message="Retry initiated successfully"
    )


@router.get("/{error_id}", response_model=ErrorItemResponse)
async def get_error_detail(
    error_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed error information"""
    error = db.query(ErrorReport).filter(
        ErrorReport.id == error_id,
        ErrorReport.tenant_id == current_user.tenant_id
    ).first()
    
    if not error:
        raise HTTPException(status_code=404, detail="Error not found")
    
    return error


@router.delete("/{error_id}")
async def dismiss_error(
    error_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark error as resolved/dismissed"""
    error = db.query(ErrorReport).filter(
        ErrorReport.id == error_id,
        ErrorReport.tenant_id == current_user.tenant_id
    ).first()
    
    if not error:
        raise HTTPException(status_code=404, detail="Error not found")
    
    error.status = 'resolved'
    error.resolved_at = datetime.utcnow()
    db.commit()
    
    return {"success": True, "message": "Error dismissed"}

