"""
User Preferences API
Manages per-user display preferences including preferred currency.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.api.dependencies import get_user_context
from app.core.database import get_db
from app.models.user_preferences import UserPreference
from app.models.tenancy import User
from app.services.exchange_rate_service import SUPPORTED_CURRENCIES

router = APIRouter()


class UserPreferencesResponse(BaseModel):
    preferred_currency_code: str
    last_updated_at: datetime


class UserPreferencesUpdate(BaseModel):
    preferred_currency_code: str

    @field_validator("preferred_currency_code")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in SUPPORTED_CURRENCIES:
            raise ValueError(
                f"Unsupported currency: {v}. Supported: {sorted(SUPPORTED_CURRENCIES)}"
            )
        return v


@router.get("", response_model=UserPreferencesResponse, tags=["User Preferences"])
def get_user_preferences(
    context=Depends(get_user_context),
    db: Session = Depends(get_db),
):
    """Get current user's display preferences."""
    pref = (
        db.query(UserPreference)
        .filter(UserPreference.user_id == context.user_id)
        .first()
    )
    if not pref:
        return UserPreferencesResponse(
            preferred_currency_code="USD",
            last_updated_at=datetime.now(timezone.utc),
        )
    return UserPreferencesResponse(
        preferred_currency_code=pref.preferred_currency_code,
        last_updated_at=pref.last_updated_at,
    )


@router.put("", response_model=UserPreferencesResponse, tags=["User Preferences"])
def update_user_preferences(
    body: UserPreferencesUpdate,
    context=Depends(get_user_context),
    db: Session = Depends(get_db),
):
    """Update current user's preferred display currency."""
    pref = (
        db.query(UserPreference)
        .filter(UserPreference.user_id == context.user_id)
        .first()
    )
    now = datetime.now(timezone.utc)
    if not pref:
        pref = UserPreference(
            user_id=context.user_id,
            preferred_currency_code=body.preferred_currency_code,
            last_updated_at=now,
        )
        db.add(pref)
    else:
        pref.preferred_currency_code = body.preferred_currency_code
        pref.last_updated_at = now
    db.commit()
    db.refresh(pref)
    return UserPreferencesResponse(
        preferred_currency_code=pref.preferred_currency_code,
        last_updated_at=pref.last_updated_at,
    )
