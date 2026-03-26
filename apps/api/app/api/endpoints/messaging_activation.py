"""
Public + authenticated messaging access activation (token-based).
"""
from __future__ import annotations

import logging
import os
from base64 import b64decode
from datetime import datetime, timezone

import redis
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.config import settings
from app.models.messaging_access_token import MessagingAccessToken
from app.models.tenancy import Shop, Tenant

logger = logging.getLogger(__name__)

_redis = redis.from_url(settings.REDIS_URL, decode_responses=True)


def _encrypt_imap_password(plaintext: str) -> bytes:
    """Same AES-GCM format as shops messaging-config (nonce + ciphertext)."""
    key_b64 = settings.ENCRYPTION_KEY or ""
    if not key_b64:
        return plaintext.encode("utf-8")
    key = b64decode(key_b64)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return nonce + ciphertext

router = APIRouter()


@router.get("/activate")
async def validate_activation_token(
    token: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Public: validate activation token (not used, not expired)."""
    row = (
        db.query(MessagingAccessToken)
        .filter(MessagingAccessToken.token == token)
        .first()
    )
    if not row:
        return {"valid": False, "reason": "not_found"}

    now = datetime.now(timezone.utc)
    if row.used_at is not None:
        return {"valid": False, "reason": "used"}
    if row.expires_at <= now:
        return {"valid": False, "reason": "expired"}

    tenant = db.query(Tenant).filter(Tenant.id == row.tenant_id).first()
    tenant_name = tenant.name if tenant else ""
    return {
        "valid": True,
        "tenant_name": tenant_name,
        "email": row.email,
    }


class ActivateBody(BaseModel):
    token: str = Field(..., min_length=1)
    imap_host: str = Field(..., min_length=1)
    imap_email: str = Field(..., min_length=1)
    imap_password: str = Field(..., min_length=1)
    adspower_profile_id: str = Field(..., min_length=1)
    accepted_terms: bool = False


@router.post("/activate")
async def post_activate(
    body: ActivateBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Complete activation: requires JWT; user must belong to token's tenant.
    Applies IMAP + AdsPower to all shops in tenant; sets messaging_access approved.
    """
    if not body.accepted_terms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Terms must be accepted",
        )

    row = (
        db.query(MessagingAccessToken)
        .filter(MessagingAccessToken.token == body.token)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid token")
    now = datetime.now(timezone.utc)
    if row.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token already used")
    if row.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired")

    user_tenant_id = int(current_user["tenant_id"])
    if user_tenant_id != int(row.tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This activation link is for a different organization",
        )

    tenant = db.query(Tenant).filter(Tenant.id == row.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    shops = (
        db.query(Shop)
        .filter(Shop.tenant_id == row.tenant_id)
        .all()
    )
    if not shops:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No shops found for this organization. Connect an Etsy shop first.",
        )

    pwd_enc = _encrypt_imap_password(body.imap_password)
    for shop in shops:
        shop.imap_host = body.imap_host.strip()
        shop.imap_email = body.imap_email.strip()
        shop.imap_password_enc = pwd_enc
        shop.adspower_profile_id = body.adspower_profile_id.strip()
        shop.updated_at = now

    tenant.messaging_access = "approved"
    tenant.updated_at = now
    row.used_at = now

    db.commit()
    try:
        _redis.publish("imap:reload", "reload")
    except Exception:
        pass
    return {"success": True}
