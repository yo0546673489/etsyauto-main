from datetime import datetime, timezone
from typing import Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models.notifications import Notification, NotificationType
from app.models.tenancy import Membership


def get_tenant_admin_user_ids(db: Session, tenant_id: int) -> List[int]:
    return [
        membership.user_id
        for membership in db.query(Membership).filter(
            Membership.tenant_id == tenant_id,
            Membership.role.in_(["owner", "admin"]),
            Membership.invitation_status == "accepted",
        ).all()
    ]


def create_notifications(
    db: Session,
    tenant_id: int,
    user_ids: Iterable[int],
    notification_type: NotificationType,
    title: str,
    message: str,
    action_url: Optional[str] = None,
    action_label: Optional[str] = None,
    commit: bool = True,
) -> int:
    created_at = datetime.now(timezone.utc)
    count = 0
    for user_id in user_ids:
        notification = Notification(
            user_id=user_id,
            tenant_id=tenant_id,
            type=notification_type,
            title=title,
            message=message,
            action_url=action_url,
            action_label=action_label,
            read=False,
            created_at=created_at,
        )
        db.add(notification)
        count += 1

    if count and commit:
        db.commit()

    return count


def notify_tenant_admins(
    db: Session,
    tenant_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    action_url: Optional[str] = None,
    action_label: Optional[str] = None,
    commit: bool = True,
) -> int:
    user_ids = get_tenant_admin_user_ids(db, tenant_id)
    if not user_ids:
        return 0

    return create_notifications(
        db=db,
        tenant_id=tenant_id,
        user_ids=user_ids,
        notification_type=notification_type,
        title=title,
        message=message,
        action_url=action_url,
        action_label=action_label,
        commit=commit,
    )
