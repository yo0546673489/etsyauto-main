"""
Onboarding API Endpoints
Post-login shop setup (name & description)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import Optional
import logging

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.tenancy import Tenant, Membership

router = APIRouter()
logger = logging.getLogger(__name__)


class OnboardingRequest(BaseModel):
    shop_name: str
    description: Optional[str] = None
    
    @field_validator('shop_name')
    def validate_shop_name(cls, v):
        v = v.strip()
        if len(v) < 2:
            raise ValueError('Shop name must be at least 2 characters')
        if len(v) > 100:
            raise ValueError('Shop name must be less than 100 characters')
        return v
    
    @field_validator('description')
    def validate_description(cls, v):
        if v:
            v = v.strip()
            if len(v) > 500:
                raise ValueError('Description must be less than 500 characters')
            return v
        return None


class OnboardingResponse(BaseModel):
    success: bool
    message: str
    tenant: dict


@router.get("/status", tags=["Onboarding"])
async def get_onboarding_status(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check whether the current user's tenant still needs onboarding.
    """
    membership = db.query(Membership).filter(
        Membership.user_id == int(current_user["sub"])
    ).first()

    if not membership:
        return {"needs_onboarding": True, "onboarding_completed": False}

    tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()

    if not tenant:
        return {"needs_onboarding": True, "onboarding_completed": False}

    return {
        "needs_onboarding": not tenant.onboarding_completed,
        "onboarding_completed": tenant.onboarding_completed,
        "tenant_name": tenant.name,
    }


@router.post("/complete", response_model=OnboardingResponse, tags=["Onboarding"])
async def complete_onboarding(
    request: OnboardingRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Complete post-login onboarding by updating shop name and description
    
    **Benefits of completing onboarding:**
    - Personalize your workspace
    - Make your shop easily identifiable
    - Help team members understand your business focus
    
    Args:
        request: Shop name and optional description
        
    Returns:
        Success status and updated tenant info
    """
    try:
        # Get user's tenant
        membership = db.query(Membership).filter(
            Membership.user_id == current_user["sub"]
        ).first()
        
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User has no organization membership"
            )
        
        # Get tenant
        tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()
        
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )
        
        # Update tenant information
        tenant.name = request.shop_name
        tenant.description = request.description
        tenant.onboarding_completed = True
        
        db.commit()
        db.refresh(tenant)
        
        logger.info(f"Onboarding completed for tenant {tenant.id}: {request.shop_name}")
        
        return OnboardingResponse(
            success=True,
            message="Shop information updated successfully!",
            tenant={
                "id": tenant.id,
                "name": tenant.name,
                "description": tenant.description,
                "onboarding_completed": tenant.onboarding_completed
            }
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error completing onboarding: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update shop information. Please try again."
        )


@router.post("/skip", tags=["Onboarding"])
async def skip_onboarding(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Skip onboarding for now (can be completed later from settings)
    """
    try:
        # Get user's tenant
        membership = db.query(Membership).filter(
            Membership.user_id == current_user["sub"]
        ).first()
        
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User has no organization membership"
            )
        
        # Get tenant
        tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()
        
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )
        
        # Mark as completed (skipped) so modal doesn't show again
        tenant.onboarding_completed = True
        db.commit()
        
        logger.info(f"Onboarding skipped for tenant {tenant.id}")
        
        return {"success": True, "message": "You can complete your shop setup anytime from Settings"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error skipping onboarding: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to skip onboarding. Please try again."
        )

