"""
Notifications API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.notifications import Notification, NotificationType

router = APIRouter()


@router.options("/unread-count", include_in_schema=False)
async def options_unread_count():
    """
    Handle CORS preflight for unread-count.
    """
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Request/Response Models
class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    action_url: Optional[str]
    action_label: Optional[str]
    read: bool
    read_at: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class CreateNotificationRequest(BaseModel):
    type: NotificationType
    title: str
    message: str
    action_url: Optional[str] = None
    action_label: Optional[str] = None


@router.get("/", response_model=List[NotificationResponse], tags=["Notifications"])
async def get_notifications(
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user's notifications

    Args:
        skip: Number of notifications to skip (pagination)
        limit: Maximum number of notifications to return
        unread_only: If True, only return unread notifications

    Returns:
        List of notifications
    """
    user_id = int(current_user["sub"])

    # Build query
    query = db.query(Notification).filter(
        Notification.user_id == user_id
    )

    # Filter by read status
    if unread_only:
        query = query.filter(Notification.read == False)

    # Order by newest first
    query = query.order_by(Notification.created_at.desc())

    # Apply pagination
    notifications = query.offset(skip).limit(limit).all()

    # Format response
    return [
        NotificationResponse(
            id=n.id,
            type=n.type.value,
            title=n.title,
            message=n.message,
            action_url=n.action_url,
            action_label=n.action_label,
            read=n.read,
            read_at=n.read_at.isoformat() if n.read_at else None,
            created_at=n.created_at.isoformat()
        )
        for n in notifications
    ]


@router.get("/unread-count", tags=["Notifications"])
async def get_unread_count(
    type: Optional[NotificationType] = None,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get count of unread notifications

    Returns:
        count: Number of unread notifications
    """
    user_id = int(current_user["sub"])

    query = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read == False
    )
    if type:
        query = query.filter(Notification.type == type)
    count = query.count()

    return {"count": count}


@router.post("/mark-read-by-type", tags=["Notifications"])
async def mark_read_by_type(
    type: NotificationType,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark all notifications of a given type as read.
    """
    user_id = int(current_user["sub"])

    result = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read == False,
        Notification.type == type
    ).update({
        Notification.read: True,
        Notification.read_at: datetime.now(timezone.utc)
    })

    db.commit()

    return {
        "message": f"Marked {result} {type.value} notifications as read",
        "count": result
    }


@router.post("/{notification_id}/read", tags=["Notifications"])
async def mark_as_read(
    notification_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a notification as read

    Args:
        notification_id: ID of the notification to mark as read

    Returns:
        Success message
    """
    user_id = int(current_user["sub"])

    # Find notification
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user_id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    # Mark as read
    notification.read = True
    notification.read_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Notification marked as read"}


@router.post("/mark-all-read", tags=["Notifications"])
async def mark_all_as_read(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark all user's notifications as read

    Returns:
        count: Number of notifications marked as read
    """
    user_id = int(current_user["sub"])

    # Update all unread notifications
    result = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read == False
    ).update({
        "read": True,
        "read_at": datetime.now(timezone.utc)
    })

    db.commit()

    return {
        "message": f"Marked {result} notifications as read",
        "count": result
    }


@router.delete("/{notification_id}", tags=["Notifications"])
async def delete_notification(
    notification_id: int,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a notification

    Args:
        notification_id: ID of the notification to delete

    Returns:
        Success message
    """
    user_id = int(current_user["sub"])

    # Find notification
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user_id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    # Delete notification
    db.delete(notification)
    db.commit()

    return {"message": "Notification deleted"}


@router.delete("/", tags=["Notifications"])
async def delete_all_notifications(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete all user's read notifications

    Returns:
        count: Number of notifications deleted
    """
    user_id = int(current_user["sub"])

    # Delete all read notifications
    result = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.read == True
    ).delete()

    db.commit()

    return {
        "message": f"Deleted {result} notifications",
        "count": result
    }


@router.post("/create", tags=["Notifications"])
async def create_notification(
    request: CreateNotificationRequest,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a notification for the current user.
    Restricted to owner/admin roles only.

    Args:
        request: Notification details

    Returns:
        Created notification
    """
    user_id = int(current_user["sub"])
    tenant_id = int(current_user["tenant_id"])
    role = current_user.get("role", "").lower()
    if role not in ("owner", "admin", "employee"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can create notifications"
        )

    notification = Notification(
        user_id=user_id,
        tenant_id=tenant_id,
        type=request.type,
        title=request.title,
        message=request.message,
        action_url=request.action_url,
        action_label=request.action_label
    )

    db.add(notification)
    db.commit()
    db.refresh(notification)

    return NotificationResponse(
        id=notification.id,
        type=notification.type.value,
        title=notification.title,
        message=notification.message,
        action_url=notification.action_url,
        action_label=notification.action_label,
        read=notification.read,
        read_at=notification.read_at.isoformat() if notification.read_at else None,
        created_at=notification.created_at.isoformat()
    )
