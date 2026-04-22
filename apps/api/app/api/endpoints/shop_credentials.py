"""
Shop Credentials — CRUD for the tenant-scoped shop-details list.
Used by the "רשימת חנויות" UI page.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import get_user_context, UserContext
from app.models.shop_credentials import ShopCredential

router = APIRouter()


class ShopCredentialBase(BaseModel):
    shop_number: Optional[int] = None
    name: Optional[str] = None
    email: Optional[str] = None
    former_email: Optional[str] = None
    password: Optional[str] = None
    etsy_password: Optional[str] = None
    phone: Optional[str] = None
    credit_card: Optional[str] = None
    bank: Optional[str] = None
    proxy: Optional[str] = None
    ebay: Optional[str] = None
    notes: Optional[str] = None


class ShopCredentialCreate(ShopCredentialBase):
    pass


class ShopCredentialUpdate(ShopCredentialBase):
    pass


class ShopCredentialOut(ShopCredentialBase):
    id: int

    class Config:
        from_attributes = True


def _serialize(sc: ShopCredential) -> dict:
    return {
        "id": sc.id,
        "shop_number": sc.shop_number,
        "name": sc.name,
        "email": sc.email,
        "former_email": sc.former_email,
        "password": sc.password,
        "etsy_password": sc.etsy_password,
        "phone": sc.phone,
        "credit_card": sc.credit_card,
        "bank": sc.bank,
        "proxy": sc.proxy,
        "ebay": sc.ebay,
        "notes": sc.notes,
    }


@router.get("", response_model=List[ShopCredentialOut])
def list_credentials(
    ctx: UserContext = Depends(get_user_context),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ShopCredential)
        .filter(ShopCredential.tenant_id == ctx.tenant_id)
        .order_by(
            # Put rows with a shop_number first (ordered), then unnumbered rows last.
            ShopCredential.shop_number.is_(None),
            ShopCredential.shop_number.asc(),
            ShopCredential.id.asc(),
        )
        .all()
    )
    return [_serialize(r) for r in rows]


@router.post("", response_model=ShopCredentialOut, status_code=status.HTTP_201_CREATED)
def create_credential(
    payload: ShopCredentialCreate,
    ctx: UserContext = Depends(get_user_context),
    db: Session = Depends(get_db),
):
    sc = ShopCredential(tenant_id=ctx.tenant_id, **payload.model_dump(exclude_unset=True))
    db.add(sc)
    db.commit()
    db.refresh(sc)
    return _serialize(sc)


@router.patch("/{credential_id}", response_model=ShopCredentialOut)
def update_credential(
    credential_id: int,
    payload: ShopCredentialUpdate,
    ctx: UserContext = Depends(get_user_context),
    db: Session = Depends(get_db),
):
    sc = (
        db.query(ShopCredential)
        .filter(ShopCredential.id == credential_id, ShopCredential.tenant_id == ctx.tenant_id)
        .first()
    )
    if not sc:
        raise HTTPException(status_code=404, detail="not_found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(sc, k, v)
    db.commit()
    db.refresh(sc)
    return _serialize(sc)


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credential(
    credential_id: int,
    ctx: UserContext = Depends(get_user_context),
    db: Session = Depends(get_db),
):
    sc = (
        db.query(ShopCredential)
        .filter(ShopCredential.id == credential_id, ShopCredential.tenant_id == ctx.tenant_id)
        .first()
    )
    if not sc:
        raise HTTPException(status_code=404, detail="not_found")
    db.delete(sc)
    db.commit()
    return None
