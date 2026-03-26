"""
Super-admin portal API (password + HMAC session cookie).
"""
from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.database import get_db
from app.models.messaging_access_token import MessagingAccessToken
from app.models.tenancy import Shop, Tenant, User

router = APIRouter()

_TENANTS_BASE_SQL = """
SELECT
  t.id,
  t.name,
  u.email AS owner_email,
  t.billing_tier,
  t.status,
  t.messaging_access,
  COUNT(DISTINCT s.id) AS shop_count,
  COUNT(DISTINCT m2.id) AS member_count,
  t.created_at
FROM tenants t
LEFT JOIN memberships m ON m.tenant_id = t.id AND m.role = 'owner'
LEFT JOIN users u ON u.id = m.user_id
LEFT JOIN shops s ON s.tenant_id = t.id
LEFT JOIN memberships m2 ON m2.tenant_id = t.id
"""


def _admin_session_token() -> str:
    return hmac.new(
        settings.ADMIN_PORTAL_SECRET.encode(),
        b"admin_session",
        hashlib.sha256,
    ).hexdigest()


def verify_admin_session(
    admin_session: str | None = Cookie(None, alias="admin_session"),
):
    if not settings.ADMIN_PORTAL_SECRET or len(settings.ADMIN_PORTAL_SECRET) < 16:
        raise HTTPException(status_code=503, detail="Admin portal not configured")
    if not admin_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    expected = _admin_session_token()
    if not hmac.compare_digest(admin_session.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid session")


class VerifyBody(BaseModel):
    password: str = Field(..., min_length=1)


@router.post("/auth/verify")
async def verify_admin_password(body: VerifyBody):
    """Validate admin password and set httpOnly session cookie. No header required."""
    if len(body.password) < 16:
        raise HTTPException(status_code=401, detail="Invalid password")
    if not settings.ADMIN_PORTAL_SECRET or len(settings.ADMIN_PORTAL_SECRET) < 16:
        raise HTTPException(status_code=503, detail="Admin portal not configured")
    if not hmac.compare_digest(
        body.password.encode(),
        settings.ADMIN_PORTAL_SECRET.encode(),
    ):
        raise HTTPException(status_code=401, detail="Invalid password")

    token = _admin_session_token()
    secure = bool(settings.COOKIE_SECURE)
    samesite = (settings.COOKIE_SAMESITE or "lax").lower()
    if samesite not in ("lax", "strict", "none"):
        samesite = "lax"

    resp = JSONResponse(content={"ok": True})
    resp.set_cookie(
        key="admin_session",
        value=token,
        httponly=True,
        samesite=samesite,  # type: ignore[arg-type]
        secure=secure,
        path="/",
        max_age=None,
        domain=settings.COOKIE_DOMAIN or None,
    )
    return resp


def _row_to_tenant_dict(r) -> dict:
    return {
        "id": int(r["id"]),
        "name": r["name"],
        "owner_email": r["owner_email"] or "",
        "billing_tier": r["billing_tier"],
        "status": r["status"],
        "messaging_access": r["messaging_access"],
        "shop_count": int(r["shop_count"] or 0),
        "member_count": int(r["member_count"] or 0),
        "created_at": r["created_at"].isoformat() if r["created_at"] else "",
    }


def _activation_url(token_str: str) -> str:
    base = (settings.FRONTEND_URL or "http://localhost:3000").rstrip("/")
    return f"{base}/messaging/activate?token={token_str}"


def _latest_token_for_tenant(db: Session, tenant_id: int) -> MessagingAccessToken | None:
    return (
        db.query(MessagingAccessToken)
        .filter(MessagingAccessToken.tenant_id == tenant_id)
        .order_by(MessagingAccessToken.created_at.desc())
        .first()
    )


def _token_payload(mat: MessagingAccessToken) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    activation = _activation_url(mat.token)
    remaining_sec = max(0, int((mat.expires_at - now).total_seconds())) if mat.expires_at > now else 0
    return {
        "token": mat.token,
        "email": mat.email,
        "expires_at": mat.expires_at.isoformat() if mat.expires_at else None,
        "used_at": mat.used_at.isoformat() if mat.used_at else None,
        "created_at": mat.created_at.isoformat() if mat.created_at else None,
        "activation_url": activation,
        "seconds_remaining": remaining_sec,
        "is_valid": mat.used_at is None and mat.expires_at > now,
    }


@router.get("/stats", dependencies=[Depends(verify_admin_session)])
async def get_platform_stats(db: Session = Depends(get_db)):
    total_tenants = db.query(func.count(Tenant.id)).scalar() or 0
    active_tenants = (
        db.query(func.count(Tenant.id)).filter(Tenant.status == "active").scalar() or 0
    )
    total_shops = (
        db.query(func.count(Shop.id)).filter(Shop.status == "connected").scalar() or 0
    )
    total_users = (
        db.query(func.count(User.id)).filter(User.deleted_at.is_(None)).scalar() or 0
    )
    pending_messaging_requests = (
        db.query(func.count(Tenant.id))
        .filter(Tenant.messaging_access == "pending")
        .scalar()
        or 0
    )
    return {
        "total_tenants": int(total_tenants),
        "active_tenants": int(active_tenants),
        "total_shops": int(total_shops),
        "total_users": int(total_users),
        "pending_messaging_requests": int(pending_messaging_requests),
    }


@router.get("/tenants", dependencies=[Depends(verify_admin_session)])
async def list_tenants(db: Session = Depends(get_db)):
    sql = text(
        _TENANTS_BASE_SQL
        + """
GROUP BY t.id, t.name, u.email, t.billing_tier, t.status, t.messaging_access, t.created_at
ORDER BY t.created_at DESC
"""
    )
    result = db.execute(sql)
    rows = result.mappings().all()
    return [_row_to_tenant_dict(r) for r in rows]


@router.get("/message-access", dependencies=[Depends(verify_admin_session)])
async def list_message_access(db: Session = Depends(get_db)):
    """All tenants with messaging status and latest activation token (if any)."""
    sql = text(
        _TENANTS_BASE_SQL
        + """
GROUP BY t.id, t.name, u.email, t.billing_tier, t.status, t.messaging_access, t.created_at
ORDER BY t.created_at DESC
"""
    )
    result = db.execute(sql)
    rows = result.mappings().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        tid = int(r["id"])
        base = _row_to_tenant_dict(r)
        latest = _latest_token_for_tenant(db, tid)
        base["latest_token"] = _token_payload(latest) if latest else None
        out.append(base)
    return out


class GenerateLinkBody(BaseModel):
    email: str | None = Field(None, description="Recipient email (defaults to owner email)")


@router.post(
    "/messaging-access/{tenant_id}/generate-link",
    dependencies=[Depends(verify_admin_session)],
)
async def generate_messaging_access_link(
    tenant_id: int,
    db: Session = Depends(get_db),
    body: GenerateLinkBody = Body(default_factory=GenerateLinkBody),
):
    """
    Create or return an unused activation token (24h TTL).
    Blocked if tenant.messaging_access == 'denied'.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.messaging_access == "denied":
        raise HTTPException(
            status_code=400,
            detail="Cannot generate link for a denied tenant",
        )

    now = datetime.now(timezone.utc)
    email_for_row: str | None = None
    if body.email and body.email.strip():
        email_for_row = body.email.strip()
    else:
        row_o = db.execute(
            text(
                """
SELECT u.email FROM memberships m
JOIN users u ON u.id = m.user_id
WHERE m.tenant_id = :tid AND m.role = 'owner'
LIMIT 1
"""
            ),
            {"tid": tenant_id},
        ).first()
        email_for_row = (row_o[0] if row_o else None) or ""
    if not email_for_row:
        raise HTTPException(
            status_code=400,
            detail="No owner email found; pass email in request body",
        )

    existing = (
        db.query(MessagingAccessToken)
        .filter(
            MessagingAccessToken.tenant_id == tenant_id,
            MessagingAccessToken.used_at.is_(None),
            MessagingAccessToken.expires_at > now,
        )
        .order_by(MessagingAccessToken.created_at.desc())
        .first()
    )
    if existing:
        return {
            "token": existing.token,
            "activation_url": _activation_url(existing.token),
            "expires_at": existing.expires_at.isoformat(),
            "reused": True,
        }

    token_str = str(uuid.uuid4())
    expires = now + timedelta(hours=24)
    mat = MessagingAccessToken(
        tenant_id=tenant_id,
        token=token_str,
        email=email_for_row,
        expires_at=expires,
        used_at=None,
    )
    db.add(mat)
    # Set tenant to pending if currently 'none' (link issued, awaiting activation)
    if tenant.messaging_access == "none":
        tenant.messaging_access = "pending"
    db.commit()
    db.refresh(mat)
    return {
        "token": mat.token,
        "activation_url": _activation_url(mat.token),
        "expires_at": mat.expires_at.isoformat(),
        "reused": False,
    }


@router.post(
    "/messaging-access/{tenant_id}/approve",
    dependencies=[Depends(verify_admin_session)],
)
async def approve_messaging_access(tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.messaging_access = "approved"
    tenant.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "tenant_id": tenant_id}


@router.post(
    "/messaging-access/{tenant_id}/deny",
    dependencies=[Depends(verify_admin_session)],
)
async def deny_messaging_access(tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.messaging_access = "denied"
    tenant.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "tenant_id": tenant_id}
