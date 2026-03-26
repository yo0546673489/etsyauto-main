from datetime import datetime, timezone
from typing import List, Optional
import os
import redis
from base64 import b64decode

from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings
from app.core.database import SessionLocal  # type: ignore
from app.models.messaging import MessageThread  # type: ignore
from app.models.tenancy import Shop  # type: ignore
from app.worker.tasks.messaging import scrape_conversation, send_reply  # type: ignore

# NOTE: These imports assume an existing auth dependency module following
# your current JWT / RBAC patterns.
from app.api.dependencies import require_messaging_access, assert_messaging_access_approved  # type: ignore


router = APIRouter(prefix="/api/messages", tags=["Messages"])


class InternalCreateThreadRequest(BaseModel):
    shop_id: int
    conversation_url: str
    customer_name: Optional[str] = None


class MessageThreadPreview(BaseModel):
    id: int
    shop_id: int
    customer_name: Optional[str]
    customer_message_preview: Optional[str]
    status: str
    created_at: datetime
    replied_at: Optional[datetime]


class MessageListResponse(BaseModel):
    threads: List[MessageThreadPreview]
    total: int
    page: int
    limit: int


class MessageThreadDetail(BaseModel):
    id: int
    shop_id: int
    tenant_id: int
    customer_name: Optional[str]
    customer_message: Optional[str]
    status: str
    replied_text: Optional[str]
    replied_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    etsy_conversation_url: str


class ReplyRequest(BaseModel):
    reply_text: str


class MessagingConfigRequest(BaseModel):
    adspower_profile_id: str
    imap_host: str
    imap_email: str
    imap_password: str


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _encrypt_imap_password(plaintext: str) -> bytes:
    """
    Encrypt IMAP password using AES-GCM with the configured ENCRYPTION_KEY.

    Stored format: nonce (12 bytes) + ciphertext_and_tag.
    """
    key_b64 = settings.ENCRYPTION_KEY or ""
    if not key_b64:
        # Fallback: store as UTF-8 bytes if no key configured (dev only).
        return plaintext.encode("utf-8")

    key = b64decode(key_b64)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return nonce + ciphertext


def _require_internal_secret(internal_secret: Optional[str]) -> None:
    expected = os.getenv("INTERNAL_API_SECRET") or ""
    if not expected or internal_secret != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_internal_secret"},
        )


def _require_creator_or_admin(user) -> None:
    role = (getattr(user, "role", "") or "").lower()
    if role not in ("owner", "admin", "creator"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "insufficient_permissions"},
        )


def _require_admin(user) -> None:
    role = (getattr(user, "role", "") or "").lower()
    if role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "insufficient_permissions"},
        )


@router.post("/internal/create-thread")
def internal_create_thread(
    payload: InternalCreateThreadRequest,
    internal_secret: Optional[str] = Header(None, alias="INTERNAL_API_SECRET"),
    db: Session = Depends(get_db),
):
    """
    Internal endpoint called by IMAP listener.
    Authenticated via INTERNAL_API_SECRET header.
    """
    _require_internal_secret(internal_secret)

    shop: Optional[Shop] = db.query(Shop).get(payload.shop_id)  # type: ignore[attr-defined]
    if not shop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "shop_not_found"},
        )

    assert_messaging_access_approved(db, int(shop.tenant_id))  # type: ignore[arg-type]

    thread = MessageThread(
        tenant_id=shop.tenant_id,  # type: ignore[attr-defined]
        shop_id=shop.id,  # type: ignore[attr-defined]
        etsy_conversation_url=payload.conversation_url,
        customer_name=payload.customer_name,
        status="pending_read",
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)

    # Enqueue scrape task
    scrape_conversation.delay(thread.id)

    return {"thread_id": thread.id}


@router.get("", response_model=MessageListResponse)
def list_threads(
    shop_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_messaging_access),
):
    """
    List message threads for the current tenant.
    """
    query = db.query(MessageThread).filter(  # type: ignore[attr-defined]
        MessageThread.tenant_id == current_user.tenant_id  # type: ignore[attr-defined]
    )

    if shop_id is not None:
        query = query.filter(MessageThread.shop_id == shop_id)
    if status_filter is not None:
        query = query.filter(MessageThread.status == status_filter)

    total = query.count()
    query = query.order_by(MessageThread.created_at.desc())
    offset = (page - 1) * limit
    threads = query.offset(offset).limit(limit).all()

    results: List[MessageThreadPreview] = []
    for t in threads:
        preview = (t.customer_message or "")[:100] if getattr(t, "customer_message", None) else None
        results.append(
            MessageThreadPreview(
                id=t.id,
                shop_id=t.shop_id,
                customer_name=t.customer_name,
                customer_message_preview=preview,
                status=t.status,
                created_at=t.created_at,
                replied_at=t.replied_at,
            )
        )

    return {
        "threads": results,
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/{thread_id}", response_model=MessageThreadDetail)
def get_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_messaging_access),
):
    """
    Get full details for a single message thread.
    """
    thread: Optional[MessageThread] = db.query(MessageThread).get(thread_id)  # type: ignore[attr-defined]
    if not thread or thread.tenant_id != current_user.tenant_id:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "thread_not_found"},
        )

    return MessageThreadDetail(
        id=thread.id,
        shop_id=thread.shop_id,
        tenant_id=thread.tenant_id,
        customer_name=thread.customer_name,
        customer_message=thread.customer_message,
        status=thread.status,
        replied_text=thread.replied_text,
        replied_at=thread.replied_at,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        etsy_conversation_url=thread.etsy_conversation_url,
    )


@router.post("/{thread_id}/reply")
def reply_to_thread(
    thread_id: int,
    payload: ReplyRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_messaging_access),
):
    """
    Queue a reply to an Etsy conversation thread.
    Requires at least Creator role.
    """
    _require_creator_or_admin(current_user)

    thread: Optional[MessageThread] = db.query(MessageThread).get(thread_id)  # type: ignore[attr-defined]
    if not thread or thread.tenant_id != current_user.tenant_id:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "thread_not_found"},
        )

    if thread.status != "unread":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "thread_not_unread"},
        )

    # Enqueue Celery task
    send_reply.delay(thread_id, payload.reply_text)

    return {"queued": True, "thread_id": thread_id}


# Canonical messaging-config endpoints live at /api/shops/{shop_id}/messaging-config
# (see app.api.endpoints.shops). This route is deprecated and commented out to avoid confusion.
#
# @router.patch("/shops/{shop_id}/messaging-config")
# def update_messaging_config(
#     shop_id: int,
#     payload: MessagingConfigRequest,
#     db: Session = Depends(get_db),
#     current_user=Depends(get_current_user),
# ):
#     ...
#     return {"updated": True}


@router.post("/{thread_id}/retry-scrape")
def retry_scrape(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_messaging_access),
):
    """
    Retry scraping a failed or pending message thread.
    """
    thread: Optional[MessageThread] = db.query(MessageThread).get(thread_id)  # type: ignore[attr-defined]
    if not thread or thread.tenant_id != current_user.tenant_id:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "thread_not_found"},
        )

    if thread.status not in ("failed", "pending_read"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "thread_not_retryable"},
        )

    scrape_conversation.delay(thread_id)

    return {"queued": True, "thread_id": thread_id}

