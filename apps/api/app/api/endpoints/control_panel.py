"""
Control Panel API — internal dashboard for the platform owner.
Completely separate from admin.py.
All routes prefixed with /api/cp/ (registered in main.py).
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.database import get_db
from app.models.tenancy import Tenant, Shop, User

router = APIRouter()


def _cp_session_token() -> str:
    secret = settings.CONTROL_PANEL_SECRET
    return hmac.new(secret.encode(), b"control_panel_session", hashlib.sha256).hexdigest()


def verify_cp_session(
    cp_session: str | None = Cookie(None, alias="cp_session"),
):
    secret = getattr(settings, "CONTROL_PANEL_SECRET", "")
    if not secret or len(secret) < 4:
        raise HTTPException(status_code=503, detail="Control Panel not configured")
    if not cp_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not hmac.compare_digest(cp_session.encode(), _cp_session_token().encode()):
        raise HTTPException(status_code=401, detail="Invalid session")


class LoginBody(BaseModel):
    password: str = Field(..., min_length=1)


@router.post("/auth/login")
async def cp_login(body: LoginBody):
    secret = getattr(settings, "CONTROL_PANEL_SECRET", "")
    if not secret or len(secret) < 4:
        raise HTTPException(status_code=503, detail="Control Panel not configured")
    if not hmac.compare_digest(body.password.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="Invalid password")
    resp = JSONResponse(content={"ok": True})
    resp.set_cookie(
        key="cp_session",
        value=_cp_session_token(),
        httponly=True,
        samesite="lax",
        secure=bool(getattr(settings, "COOKIE_SECURE", False)),
        path="/",
        max_age=86400 * 7,
        domain=getattr(settings, "COOKIE_DOMAIN", None) or None,
    )
    return resp


@router.post("/auth/logout")
async def cp_logout():
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie("cp_session", path="/")
    return resp


@router.get("/dashboard", dependencies=[Depends(verify_cp_session)])
async def dashboard_stats(db: Session = Depends(get_db)):
    total_tenants = db.query(func.count(Tenant.id)).scalar() or 0
    active_tenants = db.query(func.count(Tenant.id)).filter(Tenant.status == "active").scalar() or 0
    total_users = db.query(func.count(User.id)).filter(User.deleted_at.is_(None)).scalar() or 0
    total_shops = db.query(func.count(Shop.id)).filter(Shop.status == "connected").scalar() or 0
    messaging_approved = db.query(func.count(Tenant.id)).filter(Tenant.messaging_access == "approved").scalar() or 0
    discounts_approved = db.query(func.count(Tenant.id)).filter(Tenant.discounts_access == "approved").scalar() or 0
    automations_approved = db.query(func.count(Tenant.id)).filter(Tenant.automations_access == "approved").scalar() or 0
    return {
        "total_tenants": int(total_tenants),
        "active_tenants": int(active_tenants),
        "total_users": int(total_users),
        "total_shops": int(total_shops),
        "features": {
            "messaging": int(messaging_approved),
            "discounts": int(discounts_approved),
            "automations": int(automations_approved),
        },
    }


@router.get("/customers", dependencies=[Depends(verify_cp_session)])
async def list_customers(db: Session = Depends(get_db)):
    sql = text("""
        SELECT
            t.id AS tenant_id, t.name AS org_name, t.billing_tier, t.status,
            t.messaging_access, t.discounts_access, t.automations_access, t.created_at,
            u.id AS user_id, u.email, u.name AS user_name,
            u.last_login_at, u.email_verified,
            COUNT(DISTINCT s.id) AS shop_count,
            COUNT(DISTINCT m2.id) AS member_count
        FROM tenants t
        LEFT JOIN memberships m ON m.tenant_id = t.id AND m.role = 'owner'
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN shops s ON s.tenant_id = t.id AND s.status = 'connected'
        LEFT JOIN memberships m2 ON m2.tenant_id = t.id
        GROUP BY t.id, t.name, t.billing_tier, t.status,
                 t.messaging_access, t.discounts_access, t.automations_access,
                 t.created_at, u.id, u.email, u.name, u.last_login_at, u.email_verified
        ORDER BY t.created_at DESC
    """)
    rows = db.execute(sql).mappings().all()
    return [
        {
            "tenant_id": int(r["tenant_id"]),
            "org_name": r["org_name"],
            "email": r["email"] or "",
            "user_name": r["user_name"] or "",
            "billing_tier": r["billing_tier"],
            "status": r["status"],
            "email_verified": r["email_verified"] or False,
            "last_login_at": r["last_login_at"].isoformat() if r["last_login_at"] else None,
            "shop_count": int(r["shop_count"] or 0),
            "member_count": int(r["member_count"] or 0),
            "messaging_access": r["messaging_access"],
            "discounts_access": r["discounts_access"],
            "automations_access": r["automations_access"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else "",
        }
        for r in rows
    ]


@router.get("/customers/{tenant_id}", dependencies=[Depends(verify_cp_session)])
async def get_customer_details(tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Customer not found")
    members = db.execute(text("""
        SELECT u.id, u.email, u.name, u.profile_picture_url, u.last_login_at,
               u.created_at, u.email_verified, m.role
        FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id = :tid AND u.deleted_at IS NULL
        ORDER BY m.role, u.created_at
    """), {"tid": tenant_id}).mappings().all()
    shops = db.execute(text("""
        SELECT s.id, s.etsy_shop_id, s.display_name, s.status, s.created_at,
               (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) AS product_count,
               (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id) AS order_count
        FROM shops s WHERE s.tenant_id = :tid ORDER BY s.created_at
    """), {"tid": tenant_id}).mappings().all()
    return {
        "tenant_id": tenant.id,
        "org_name": tenant.name,
        "billing_tier": tenant.billing_tier,
        "status": tenant.status,
        "onboarding_completed": getattr(tenant, 'onboarding_completed', False),
        "messaging_access": tenant.messaging_access,
        "discounts_access": tenant.discounts_access,
        "automations_access": tenant.automations_access,
        "created_at": tenant.created_at.isoformat() if tenant.created_at else "",
        "members": [{"id": int(m["id"]), "email": m["email"], "name": m["name"] or "", "role": m["role"], "email_verified": m["email_verified"], "last_login_at": m["last_login_at"].isoformat() if m["last_login_at"] else None, "created_at": m["created_at"].isoformat() if m["created_at"] else ""} for m in members],
        "shops": [{"id": int(s["id"]), "etsy_shop_id": s["etsy_shop_id"], "display_name": s["display_name"] or s["etsy_shop_id"], "status": s["status"], "product_count": int(s["product_count"] or 0), "order_count": int(s["order_count"] or 0), "created_at": s["created_at"].isoformat() if s["created_at"] else ""} for s in shops],
    }


@router.delete("/customers/{tenant_id}", dependencies=[Depends(verify_cp_session)])
async def delete_customer(tenant_id: int, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Customer not found")
    try:
        user_ids = [r[0] for r in db.execute(text("SELECT user_id FROM memberships WHERE tenant_id = :tid"), {"tid": tenant_id}).fetchall()]
        shop_ids = [r[0] for r in db.execute(text("SELECT id FROM shops WHERE tenant_id = :tid"), {"tid": tenant_id}).fetchall()]
        for sid in shop_ids:
            for tbl in ["oauth_tokens", "orders", "products", "discount_rules"]:
                try:
                    db.execute(text(f"DELETE FROM {tbl} WHERE shop_id = :sid"), {"sid": sid})
                except Exception:
                    pass
        for tbl in ["shops", "notifications", "ingestion_batches", "memberships"]:
            try:
                db.execute(text(f"DELETE FROM {tbl} WHERE tenant_id = :tid"), {"tid": tenant_id})
            except Exception:
                pass
        for uid in user_ids:
            other = db.execute(text("SELECT COUNT(*) FROM memberships WHERE user_id = :uid"), {"uid": uid}).scalar()
            if other == 0:
                try:
                    db.execute(text("DELETE FROM user_preferences WHERE user_id = :uid"), {"uid": uid})
                except Exception:
                    pass
                db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})
        db.execute(text("DELETE FROM tenants WHERE id = :tid"), {"tid": tenant_id})
        db.commit()
        return {"ok": True, "deleted_tenant_id": tenant_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


VALID_FEATURES = {"messaging", "discounts", "automations"}
FEATURE_COLUMN = {"messaging": "messaging_access", "discounts": "discounts_access", "automations": "automations_access"}


class GrantByEmailBody(BaseModel):
    email: str = Field(..., min_length=3)
    feature: str = Field(..., min_length=1)


@router.post("/permissions/grant-by-email", dependencies=[Depends(verify_cp_session)])
async def grant_by_email(body: GrantByEmailBody, db: Session = Depends(get_db)):
    if body.feature not in VALID_FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {body.feature}")
    row = db.execute(text("""
        SELECT t.id FROM users u
        JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
        JOIN tenants t ON t.id = m.tenant_id
        WHERE LOWER(u.email) = LOWER(:email) LIMIT 1
    """), {"email": body.email.strip()}).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"No customer found with email: {body.email}")
    tenant = db.query(Tenant).filter(Tenant.id == row[0]).first()
    setattr(tenant, FEATURE_COLUMN[body.feature], "approved")
    tenant.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "tenant_id": tenant.id, "feature": body.feature}


@router.post("/permissions/{tenant_id}/{feature}/approve", dependencies=[Depends(verify_cp_session)])
async def approve_feature(tenant_id: int, feature: str, db: Session = Depends(get_db)):
    if feature not in VALID_FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {feature}")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Not found")
    setattr(tenant, FEATURE_COLUMN[feature], "approved")
    tenant.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/permissions/{tenant_id}/{feature}/revoke", dependencies=[Depends(verify_cp_session)])
async def revoke_feature(tenant_id: int, feature: str, db: Session = Depends(get_db)):
    if feature not in VALID_FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {feature}")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Not found")
    setattr(tenant, FEATURE_COLUMN[feature], "none")
    tenant.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
