"""
Team Management Endpoints
Manage tenant memberships, roles, and invitations
"""

from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List
from datetime import datetime, timezone, timedelta
import secrets

from ...core.database import get_db
from ...models.tenancy import User, Tenant, Membership, Shop
from ...models.notifications import Notification, NotificationType
from ..dependencies import get_current_user, get_user_context, UserContext, require_role, require_role_with_context, require_permission
from ...core.rbac import Permission
from ...core.query_helpers import ensure_tenant_access
from ...core.security import hash_password, verify_password, create_access_token, create_refresh_token, set_auth_cookies
from ...services.email_service import email_service
from ...core.config import settings

router = APIRouter()

# CORS headers for responses
CORS_HEADERS = {
    "Access-Control-Allow-Origin": ", ".join(settings.CORS_ORIGINS),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Credentials": "true",
}


# Request/Response Models
class InviteMemberRequest(BaseModel):
    email: EmailStr
    name: str
    role: str  # owner, admin, viewer, supplier

    class Config:
        json_schema_extra = {
            "example": {
                "email": "teammate@example.com",
                "name": "John Doe",
                "role": "admin"
            }
        }


class UpdateRoleRequest(BaseModel):
    role: str


class UpdateShopAccessRequest(BaseModel):
    shop_ids: List[int]


class AcceptInvitationRequest(BaseModel):
    token: str
    password: str | None = None  # For new users creating account
    existing_password: str | None = None  # For existing users logging in


class MemberResponse(BaseModel):
    id: int
    user_id: int
    email: str
    name: str
    role: str
    invitation_status: str  # pending, accepted, rejected
    joined_at: str
    last_login: str | None
    allowed_shop_ids: List[int] | None = None

    class Config:
        from_attributes = True


# Endpoints

@router.get("/members", response_model=List[MemberResponse])
async def list_team_members(
    context: UserContext = Depends(get_user_context),
    db: Session = Depends(get_db)
):
    """
    List all team members in the current tenant
    Available to: all authenticated users
    """
    tenant_id = context.tenant_id

    # Get all memberships for this tenant with user info
    memberships = (
        db.query(Membership, User)
        .join(User, Membership.user_id == User.id)
        .filter(Membership.tenant_id == tenant_id)
        .filter(User.deleted_at == None)
        .all()
    )

    result = []
    for membership, user in memberships:
        # Use membership acceptance date for joined_at (when they joined THIS org)
        # For pending invites, use invited_at instead
        if membership.invitation_status == 'accepted' and membership.accepted_at:
            joined_at = membership.accepted_at.isoformat()
        elif membership.invited_at:
            joined_at = membership.invited_at.isoformat()
        else:
            joined_at = user.created_at.isoformat() if user.created_at else ""
        
        result.append(MemberResponse(
            id=membership.id,
            user_id=user.id,
            email=user.email,
            name=user.name or "No name",
            role=membership.role,
            invitation_status=membership.invitation_status,
            joined_at=joined_at,
            last_login=user.last_login_at.isoformat() if user.last_login_at else None,
            allowed_shop_ids=membership.allowed_shop_ids or []
        ))

    return result


@router.post("/members/invite", status_code=status.HTTP_201_CREATED)
async def invite_team_member(
    request: InviteMemberRequest,
    context: UserContext = Depends(require_permission(Permission.MANAGE_TEAM)),
    db: Session = Depends(get_db)
):
    """
    Invite a new team member to the tenant
    Requires: MANAGE_TEAM permission (Owner, Admin)

    If user exists with this email, adds them to tenant
    If user doesn't exist, creates new user account
    """
    tenant_id = context.tenant_id

    # Validate role
    valid_roles = ["owner", "admin", "viewer", "supplier"]
    if request.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}"
        )

    # Get current user details for invitation email
    inviter = db.query(User).filter(User.id == context.user_id).first()
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    # Generate invitation token (valid for 7 days)
    invitation_token = secrets.token_urlsafe(32)
    invitation_expires = datetime.now(timezone.utc) + timedelta(days=7)

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == request.email.lower()).first()

    if existing_user:
        # Check if already a member
        existing_membership = db.query(Membership).filter(
            Membership.user_id == existing_user.id,
            Membership.tenant_id == tenant_id
        ).first()

        if existing_membership:
            # Check if invitation is pending
            if existing_membership.invitation_status == 'pending':
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User has a pending invitation. Please wait for them to accept."
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this organization"
            )

        # Add existing user to tenant with pending invitation
        membership = Membership(
            user_id=existing_user.id,
            tenant_id=tenant_id,
            role=request.role,
            invitation_status='pending',
            invitation_token=invitation_token,
            invitation_token_expires=invitation_expires,
            invited_at=datetime.now(timezone.utc)
        )
        db.add(membership)
        db.commit()

        # Send invitation email
        email_sent = email_service.send_team_invitation(
            to_email=existing_user.email,
            to_name=existing_user.name or request.name,
            inviter_name=inviter.name or inviter.email,
            organization_name=tenant.name,
            role=request.role,
            invitation_token=invitation_token
        )

        return {
            "message": "Invitation sent to existing user",
            "user_id": existing_user.id,
            "email": existing_user.email,
            "role": request.role,
            "status": "pending",
            "email_sent": email_sent
        }

    else:
        # Create new user (without password - they'll set it when accepting invitation)
        new_user = User(
            email=request.email.lower(),
            name=request.name,
            password_hash=None,  # Will be set when user accepts invitation
            created_at=datetime.now(timezone.utc)
        )
        db.add(new_user)
        db.flush()  # Get user ID

        # Add membership with pending invitation
        membership = Membership(
            user_id=new_user.id,
            tenant_id=tenant_id,
            role=request.role,
            invitation_status='pending',
            invitation_token=invitation_token,
            invitation_token_expires=invitation_expires,
            invited_at=datetime.now(timezone.utc)
        )
        db.add(membership)
        db.commit()

        # Send invitation email
        email_sent = email_service.send_team_invitation(
            to_email=new_user.email,
            to_name=new_user.name,
            inviter_name=inviter.name or inviter.email,
            organization_name=tenant.name,
            role=request.role,
            invitation_token=invitation_token
        )

        return {
            "message": "Invitation sent to new user",
            "user_id": new_user.id,
            "email": new_user.email,
            "role": request.role,
            "status": "pending",
            "email_sent": email_sent,
            "note": "User will create their account when accepting the invitation"
        }


@router.options("/invitations/accept")
async def accept_invitation_preflight():
    """Handle CORS preflight for invitation acceptance"""
    return Response(status_code=200, headers=CORS_HEADERS)


@router.post("/invitations/accept")
async def accept_invitation(
    request: AcceptInvitationRequest,
    db: Session = Depends(get_db)
):
    """
    Accept a team invitation
    Available to: anyone with a valid invitation token

    For new users: `password` must be provided to create account.
    For existing users: `existing_password` can be provided to verify identity.
    """
    # Find membership by invitation token
    membership = db.query(Membership).filter(
        Membership.invitation_token == request.token,
        Membership.invitation_status == 'pending'
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired invitation token"
        )

    # Check if invitation has expired
    if membership.invitation_token_expires and membership.invitation_token_expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invitation has expired"
        )

    # Get user
    user = db.query(User).filter(User.id == membership.user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Handle new users (no password set yet)
    if not user.password_hash:
        if not request.password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password is required for new users"
            )

        # Set password for new user
        user.password_hash = hash_password(request.password)
        user.email_verified = True  # Auto-verify email for invited users
    
    # Handle existing users (password already set)
    else:
        # If they want to change their password, they MUST provide existing_password
        if request.password:
            if not request.existing_password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="existing_password is required to change password for existing users"
                )
            if not verify_password(request.existing_password, user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect password"
                )
            user.password_hash = hash_password(request.password)
        elif request.existing_password:
            # Verify existing password even if not changing it (identity confirmation)
            if not verify_password(request.existing_password, user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect password"
                )

    # Update membership status
    membership.invitation_status = 'accepted'
    membership.accepted_at = datetime.now(timezone.utc)
    
    # Auto-assign shop access for suppliers
    if membership.role.lower() == 'supplier':
        # Grant access to all tenant shops automatically
        tenant_shop_ids = [
            shop.id for shop in db.query(Shop).filter(
                Shop.tenant_id == membership.tenant_id,
                Shop.status == 'connected'
            ).all()
        ]
        if tenant_shop_ids:
            membership.allowed_shop_ids = tenant_shop_ids
    
    # Get tenant info
    tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()

    try:
        # Create notifications for all owners and admins
        owner_admin_memberships = db.query(Membership).filter(
            Membership.tenant_id == membership.tenant_id,
            Membership.role.in_(['owner', 'admin']),
            Membership.invitation_status == 'accepted'
        ).all()

        # Create a notification for each owner/admin
        for admin_membership in owner_admin_memberships:
            notification = Notification(
                user_id=admin_membership.user_id,
                tenant_id=membership.tenant_id,
                type=NotificationType.TEAM,
                title="New Team Member",
                message=f"{user.name or user.email} has accepted the invitation and joined your team as {membership.role}.",
                action_url="/settings?tab=team",
                action_label="View Team",
                read=False,
                created_at=datetime.now(timezone.utc)
            )
            db.add(notification)
        
        # Clear token ONLY after all operations succeed
        membership.invitation_token = None
        membership.invitation_token_expires = None
        
        # Single commit at the end - all or nothing
        db.commit()

        # Create JWT + refresh token for auto-login
        access_token = create_access_token(
            user_id=user.id,
            tenant_id=membership.tenant_id,
            role=membership.role,
            email=user.email,
            name=user.name or "",
            shop_ids=membership.allowed_shop_ids or [],
            remember_me=True
        )
        refresh_tok = create_refresh_token(
            user_id=user.id,
            tenant_id=membership.tenant_id,
            role=membership.role,
        )

        # Build response body (no raw JWT token — cookies only)
        body = {
            "message": "Invitation accepted successfully",
            "user_id": user.id,
            "email": user.email,
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "role": membership.role,
        }
        response = JSONResponse(status_code=200, content=body)
        set_auth_cookies(response, access_token, refresh_tok)
        return response
        
    except Exception as e:
        # Rollback on any error - token remains valid for retry
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to accept invitation: {str(e)}"
        )


@router.patch("/members/{user_id}/role")
async def update_member_role(
    user_id: int,
    request: UpdateRoleRequest,
    context: UserContext = Depends(require_permission(Permission.MANAGE_TEAM)),
    db: Session = Depends(get_db)
):
    """
    Update a team member's role
    Requires: MANAGE_TEAM permission (Owner, Admin)

    Restrictions:
    - Cannot change your own role
    - Only owners can promote to owner
    - Admins cannot demote owners
    """
    tenant_id = context.tenant_id
    current_user_id = context.user_id
    current_user_role = context.role

    # Validate role
    valid_roles = ["owner", "admin", "viewer", "supplier"]
    if request.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}"
        )

    # Cannot change your own role
    if user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot change your own role"
        )

    # Get target membership
    membership = db.query(Membership).filter(
        Membership.user_id == user_id,
        Membership.tenant_id == tenant_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this organization"
        )

    # Only owners can promote to owner
    if request.role == "owner" and current_user_role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can promote members to owner"
        )

    # Admins cannot demote owners
    if membership.role == "owner" and current_user_role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can change the role of other owners"
        )

    # Update role
    old_role = membership.role
    membership.role = request.role
    db.commit()

    return {
        "message": "Role updated successfully",
        "user_id": user_id,
        "old_role": old_role,
        "new_role": request.role
    }


@router.patch("/members/{user_id}/shops")
async def update_member_shop_access(
    user_id: int,
    request: UpdateShopAccessRequest,
    context: UserContext = Depends(require_permission(Permission.MANAGE_TEAM)),
    db: Session = Depends(get_db)
):
    """
    Update per-shop access for a team member (viewer/supplier only).
    Requires: MANAGE_TEAM permission (Owner, Admin)
    """
    tenant_id = context.tenant_id
    current_user_id = context.user_id

    if user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot change your own shop access"
        )

    membership = db.query(Membership).filter(
        Membership.user_id == user_id,
        Membership.tenant_id == tenant_id
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User is not a member of this organization")

    if membership.role not in ("viewer", "supplier"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shop access can only be configured for viewer/supplier roles"
        )

    # Validate shop IDs belong to tenant
    if request.shop_ids:
        shop_ids = list(set(request.shop_ids))
        valid_count = db.query(Shop).filter(
            Shop.tenant_id == tenant_id,
            Shop.id.in_(shop_ids)
        ).count()
        if valid_count != len(shop_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more shop IDs are invalid")
    else:
        shop_ids = []

    membership.allowed_shop_ids = shop_ids
    db.commit()

    return {"message": "Shop access updated", "user_id": user_id, "shop_ids": shop_ids}


@router.delete("/members/{user_id}")
async def remove_team_member(
    user_id: int,
    context: UserContext = Depends(require_permission(Permission.MANAGE_TEAM)),
    db: Session = Depends(get_db)
):
    """
    Remove a team member from the tenant
    Requires: MANAGE_TEAM permission (Owner, Admin)

    Restrictions:
    - Cannot remove yourself
    - Admins cannot remove owners
    - Must have at least one owner remaining
    """
    tenant_id = context.tenant_id
    current_user_id = context.user_id
    current_user_role = context.role

    # Cannot remove yourself
    if user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot remove yourself from the organization"
        )

    # Get target membership
    membership = db.query(Membership).filter(
        Membership.user_id == user_id,
        Membership.tenant_id == tenant_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this organization"
        )

    # Admins cannot remove owners
    if membership.role == "owner" and current_user_role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can remove other owners"
        )

    # Check if this is the last owner
    if membership.role == "owner":
        owner_count = db.query(Membership).filter(
            Membership.tenant_id == tenant_id,
            Membership.role == "owner"
        ).count()

        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last owner. Promote another member to owner first."
            )

    # Remove membership
    db.delete(membership)
    db.commit()

    return {
        "message": "Member removed from organization successfully",
        "user_id": user_id
    }


@router.get("/me/role")
async def get_my_role(
    context: UserContext = Depends(get_user_context)
):
    """
    Get current user's role and permissions
    Available to: all authenticated users
    """
    from ...core.rbac import has_permission, Permission
    
    return {
        "user_id": context.user_id,
        "tenant_id": context.tenant_id,
        "role": context.role,
        "permissions": {
            "can_invite_members": has_permission(context.role, Permission.MANAGE_TEAM),
            "can_manage_roles": has_permission(context.role, Permission.MANAGE_TEAM),
            "can_remove_members": has_permission(context.role, Permission.MANAGE_TEAM),
            "can_manage_settings": has_permission(context.role, Permission.UPDATE_TENANT_SETTINGS),
            "can_create_products": has_permission(context.role, Permission.CREATE_PRODUCT),
            "can_assign_orders": has_permission(context.role, Permission.ASSIGN_ORDER),
            "can_update_fulfillment": has_permission(context.role, Permission.UPDATE_FULFILLMENT),
            "is_owner": context.role == "owner",
        }
    }
