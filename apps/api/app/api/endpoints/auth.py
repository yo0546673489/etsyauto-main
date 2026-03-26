"""
Authentication API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime, timedelta, timezone
from typing import Set, Optional
import os
import uuid
from PIL import Image
import io
import logging

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token, set_auth_cookies, clear_auth_cookies,
)
from app.core.email import generate_token, send_verification_email, send_password_reset_email, send_password_changed_notification
from app.core.config import settings
from app.core.password_validator import validate_password as validate_password_strength
from app.models.tenancy import User, Tenant, Membership
from app.models.oauth import OAuthProvider
from jose.exceptions import JWTError, ExpiredSignatureError

router = APIRouter()
logger = logging.getLogger(__name__)


# List of disposable/temporary email domains to block
DISPOSABLE_EMAIL_DOMAINS: Set[str] = {
    'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com',
    'mailinator.com', 'maildrop.cc', 'temp-mail.org', 'yopmail.com',
    'trashmail.com', 'fakeinbox.com', 'getnada.com', 'sharklasers.com',
    'spam4.me', 'mytemp.email', 'temp-mail.io', 'mohmal.com',
    'mintemail.com', 'emailondeck.com', 'dispostable.com', 'throwawaymail.com'
}


def validate_email_domain(email: str) -> bool:
    """
    Validate email domain exists and is not disposable

    Args:
        email: Email address to validate

    Returns:
        True if valid, False otherwise

    Raises:
        ValueError: If email is invalid
    """
    # Extract domain
    domain = email.split('@')[1].lower()

    # Check if disposable email
    if domain in DISPOSABLE_EMAIL_DOMAINS:
        raise ValueError(f'Disposable email addresses are not allowed')

    # Optional: Check if domain has MX records (uncomment to enable)
    # try:
    #     dns.resolver.resolve(domain, 'MX')
    # except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.exception.Timeout):
    #     raise ValueError(f'Email domain does not exist or has no mail server')

    return True


# Request/Response Models
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    tenant_name: str

    @field_validator('email')
    def validate_email(cls, v):
        """Validate email format and domain"""
        email_str = str(v).lower()

        # Additional format checks
        if '..' in email_str:
            raise ValueError('Email cannot contain consecutive dots')
        if email_str.startswith('.') or email_str.endswith('.'):
            raise ValueError('Email cannot start or end with a dot')

        # Validate domain
        validate_email_domain(email_str)

        return email_str

    @field_validator('password')
    def validate_password(cls, v):
        """Validate password strength with comprehensive rules"""
        is_valid, errors = validate_password_strength(v)
        if not is_valid:
            # Join all error messages with newlines
            raise ValueError('\n'.join(errors))
        return v

    @field_validator('name')
    def validate_name(cls, v):
        if len(v.strip()) < 2:
            raise ValueError('Name must be at least 2 characters')
        if len(v) > 100:
            raise ValueError('Name must be less than 100 characters')
        return v.strip()

    @field_validator('tenant_name')
    def validate_tenant_name(cls, v):
        if len(v.strip()) < 2:
            raise ValueError('Company/Shop name must be at least 2 characters')
        if len(v) > 100:
            raise ValueError('Company/Shop name must be less than 100 characters')
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False

    @field_validator('password')
    def validate_password(cls, v):
        if len(v) > 72:
            raise ValueError('Password must be less than 72 characters')
        return v


class TokenResponse(BaseModel):
    """Auth response — token is now sent via HttpOnly cookie, not in body."""
    token_type: str = "bearer"
    expires_in: int
    user: dict
    tenant: dict


@router.post("/register", response_model=TokenResponse, tags=["Auth"])
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user

    Creates:
    - New user account
    - Personal tenant (organization)
    - Owner membership
    - Sends email verification link

    Returns JWT token for immediate login
    """
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Generate verification token
    verification_token = generate_token()
    verification_expires = datetime.now(timezone.utc) + timedelta(hours=settings.VERIFICATION_TOKEN_EXPIRY_HOURS)

    # Create user
    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        name=request.name,
        email_verified=not settings.EMAIL_VERIFICATION_REQUIRED,  # Auto-verify if not required
        verification_token=verification_token if settings.EMAIL_VERIFICATION_REQUIRED else None,
        verification_token_expires=verification_expires if settings.EMAIL_VERIFICATION_REQUIRED else None
    )
    db.add(user)
    db.flush()  # Get user.id without committing

    # Create personal tenant (organization)
    tenant = Tenant(
        name=request.tenant_name,
        billing_tier='starter',
        status='active'
    )
    db.add(tenant)
    db.flush()

    # Create membership (owner role)
    membership = Membership(
        user_id=user.id,
        tenant_id=tenant.id,
        role='owner'
    )
    db.add(membership)

    db.commit()
    db.refresh(user)
    db.refresh(tenant)

    # Send verification email
    if settings.EMAIL_VERIFICATION_REQUIRED:
        try:
            email_sent = send_verification_email(user.email, user.name, verification_token)
            if not email_sent:
                # Log warning but don't fail registration
                logger.warning(f"Failed to send verification email to {user.email}, but account was created")
        except Exception as e:
            # Don't fail registration if email sending fails
            logger.warning(f"Exception sending verification email to {user.email}: {e}")
        
        # Return 202 Accepted - account created but requires email verification
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail="Account created successfully! Please check your email to verify your account before logging in."
        )

    # Only generate token if email verification is not required
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=tenant.id,
        role='owner',
        shop_ids=[],  # No shops yet
        remember_me=False
    )
    refresh_tok = create_refresh_token(user_id=user.id, tenant_id=tenant.id, role='owner')

    body = TokenResponse(
        expires_in=settings.JWT_TTL_SECONDS,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "email_verified": user.email_verified
        },
        tenant={
            "id": tenant.id,
            "name": tenant.name,
            "role": "owner",
            "messaging_access": getattr(tenant, "messaging_access", "none"),
        }
    )
    response = JSONResponse(content=body.model_dump())
    set_auth_cookies(response, access_token, refresh_tok)
    return response


@router.post("/login", response_model=TokenResponse, tags=["Auth"])
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Login with email and password

    Supports:
    - Account lockout after failed attempts
    - Email verification check
    - Remember me for extended sessions

    Returns JWT token for API access
    """
    # Find user
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Check if account is locked
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        minutes_left = int((user.locked_until - datetime.now(timezone.utc)).total_seconds() / 60)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account is locked. Try again in {minutes_left} minute(s)"
        )

    # Check if account was created via OAuth (no password set)
    if not user.password_hash:
        # Check which OAuth provider they used
        oauth_provider = db.query(OAuthProvider).filter(OAuthProvider.user_id == user.id).first()
        if oauth_provider:
            provider_name = oauth_provider.provider.capitalize()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This account was created using {provider_name} sign-in. Please use the '{provider_name} Sign-In' button to log in, or set a password using 'Forgot Password' to enable email/password login."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account has no password set. Please use 'Forgot Password' to set a password."
            )
    
    # Verify password
    if not verify_password(request.password, user.password_hash):
        # Increment failed login attempts
        user.failed_login_attempts += 1

        # Lock account if max attempts reached
        if user.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCOUNT_LOCKOUT_MINUTES)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"Account locked due to too many failed login attempts. Try again in {settings.ACCOUNT_LOCKOUT_MINUTES} minutes"
            )

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Check email verification (optional - can be warning only)
    if settings.EMAIL_VERIFICATION_REQUIRED and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address before logging in. Check your inbox for the verification link."
        )

    # Get user's tenant and role (ONLY accepted memberships)
    # Prefer most recently accepted membership for multi-tenant users
    membership = db.query(Membership).filter(
        Membership.user_id == user.id,
        Membership.invitation_status == 'accepted'
    ).order_by(Membership.accepted_at.desc()).first()
    
    if not membership:
        # Check if they have pending invitations
        pending = db.query(Membership).filter(
            Membership.user_id == user.id,
            Membership.invitation_status == 'pending'
        ).first()
        
        if pending:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You have a pending invitation. Please accept it before logging in."
            )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No active organization membership found"
        )

    # Get tenant info
    tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()

    # Get user's allowed shops (creator/viewer) or empty for owner/admin
    shop_ids = membership.allowed_shop_ids or []

    # Reset failed login attempts and update last login
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    # Generate JWT token with remember_me support
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=membership.tenant_id,
        role=membership.role,
        shop_ids=shop_ids,
        remember_me=request.remember_me
    )
    refresh_tok = create_refresh_token(
        user_id=user.id, tenant_id=membership.tenant_id, role=membership.role
    )

    # Calculate token expiry
    if request.remember_me:
        expires_in = settings.REMEMBER_ME_TTL_DAYS * 24 * 60 * 60  # Days to seconds
    else:
        expires_in = settings.JWT_TTL_SECONDS

    body = TokenResponse(
        expires_in=expires_in,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "email_verified": user.email_verified
        },
        tenant={
            "id": tenant.id,
            "name": tenant.name,
            "role": membership.role,
            "description": tenant.description,
            "onboarding_completed": tenant.onboarding_completed,
            "messaging_access": getattr(tenant, "messaging_access", "none"),
        }
    )
    response = JSONResponse(content=body.model_dump())
    set_auth_cookies(response, access_token, refresh_tok)
    return response


@router.post("/logout", tags=["Auth"])
async def logout():
    """
    Logout — clears HttpOnly auth cookies.
    """
    response = JSONResponse(content={"message": "Logged out successfully"})
    clear_auth_cookies(response)
    return response


@router.post("/refresh", tags=["Auth"])
async def refresh_token(request: Request, db: Session = Depends(get_db)):
    """
    Refresh the access token using the HttpOnly refresh_token cookie.
    Issues a new access_token cookie if the refresh token is valid.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token"
        )

    try:
        payload = decode_token(token)
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Must be a refresh-type token
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = int(payload["sub"])
    tenant_id = int(payload["tenant_id"])

    # Verify user still exists and membership is active
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    membership = db.query(Membership).filter(
        Membership.user_id == user_id,
        Membership.tenant_id == tenant_id,
        Membership.invitation_status == 'accepted'
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Membership not active")

    shop_ids = membership.allowed_shop_ids or []

    new_access_token = create_access_token(
        user_id=user_id,
        tenant_id=tenant_id,
        role=membership.role,
        shop_ids=shop_ids,
    )

    response = JSONResponse(content={"message": "Token refreshed"})
    # Only set the access_token cookie (refresh stays the same)
    is_prod = settings.ENVIRONMENT == "production"
    domain = settings.COOKIE_DOMAIN or None
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=is_prod or settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.JWT_TTL_SECONDS,
        path="/",
        domain=domain,
    )
    return response


@router.get("/me", tags=["Auth"])
async def get_current_user_info(current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Get current authenticated user info

    Requires: Valid JWT token
    """
    user = db.query(User).filter(User.id == int(current_user["sub"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get tenant information
    tenant = db.query(Tenant).filter(Tenant.id == int(current_user["tenant_id"])).first()

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "email_verified": user.email_verified,
        "profile_picture_url": user.profile_picture_url,
        "tenant_id": current_user["tenant_id"],
        "tenant_name": tenant.name if tenant else None,
        "tenant_description": tenant.description if tenant else None,
        "role": current_user["role"],
        "onboarding_completed": tenant.onboarding_completed if tenant else False,
        "messaging_access": getattr(tenant, "messaging_access", "none") if tenant else "none",
    }


# Email Verification Endpoints

@router.post("/verify-email", tags=["Auth"])
async def verify_email(token: str, db: Session = Depends(get_db)):
    """
    Verify user email address with token

    Args:
        token: Verification token from email

    Returns:
        Success message
    """
    # Find user with this verification token
    user = db.query(User).filter(User.verification_token == token).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )

    # Check if token expired
    if user.verification_token_expires and user.verification_token_expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired. Please request a new one."
        )

    # Mark email as verified
    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()

    return {
        "message": "Email verified successfully",
        "email": user.email
    }


@router.post("/resend-verification", tags=["Auth"])
async def resend_verification_email(email: EmailStr, db: Session = Depends(get_db)):
    """
    Resend verification email

    Args:
        email: User's email address

    Returns:
        Success message
    """
    user = db.query(User).filter(User.email == email).first()

    if not user:
        # Don't reveal if email exists
        return {"message": "If the email exists, a verification link has been sent"}

    if user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified"
        )

    # Generate new verification token
    verification_token = generate_token()
    verification_expires = datetime.now(timezone.utc) + timedelta(hours=settings.VERIFICATION_TOKEN_EXPIRY_HOURS)

    user.verification_token = verification_token
    user.verification_token_expires = verification_expires
    db.commit()

    # Send verification email
    send_verification_email(user.email, user.name, verification_token)

    return {"message": "Verification email sent"}


# Password Reset Endpoints

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator('new_password')
    def validate_password(cls, v):
        """Validate password strength with the same rules as registration"""
        is_valid, errors = validate_password_strength(v)
        if not is_valid:
            raise ValueError('\n'.join(errors))
        return v


@router.post("/forgot-password", tags=["Auth"])
async def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Request password reset link

    Args:
        request: Email address

    Returns:
        Success message (always, for security)
    """
    user = db.query(User).filter(User.email == request.email).first()

    if user:
        # Generate reset token
        reset_token = generate_token()
        reset_expires = datetime.now(timezone.utc) + timedelta(hours=settings.RESET_TOKEN_EXPIRY_HOURS)

        user.reset_token = reset_token
        user.reset_token_expires = reset_expires
        db.commit()

        # Send password reset email
        send_password_reset_email(user.email, user.name, reset_token)

    # Always return success to prevent email enumeration
    return {
        "message": "If the email exists, a password reset link has been sent"
    }


@router.post("/reset-password", tags=["Auth"])
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Reset password with token

    Args:
        request: Reset token and new password

    Returns:
        Success message
    """
    # Find user with this reset token
    user = db.query(User).filter(User.reset_token == request.token).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token"
        )

    # Check if token expired
    if user.reset_token_expires and user.reset_token_expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new one."
        )

    # Update password
    user.password_hash = hash_password(request.new_password)
    user.reset_token = None
    user.reset_token_expires = None

    # Reset failed login attempts and unlock account
    user.failed_login_attempts = 0
    user.locked_until = None

    # Mark email as verified — reset link proves the user controls this email
    user.email_verified = True

    db.commit()

    # Send notification email
    send_password_changed_notification(user.email, user.name)

    return {
        "message": "Password reset successfully",
        "email": user.email
    }


# Profile Picture Upload

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB in bytes


@router.post("/profile/upload-picture", tags=["Auth"])
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload profile picture for current user

    Requirements:
    - Valid JWT token
    - Image file (JPEG, PNG, GIF, WebP)
    - Max size: 5MB

    Returns:
        Profile picture URL
    """
    # Validate file type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )

    # Read file content
    contents = await file.read()

    # Validate file size
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum of {MAX_FILE_SIZE / (1024 * 1024)}MB"
        )

    try:
        # Validate it's actually an image and get dimensions
        image = Image.open(io.BytesIO(contents))
        image.verify()

        # Reopen for processing (verify() closes the file)
        image = Image.open(io.BytesIO(contents))

        # Create thumbnail (150x150)
        thumbnail_size = (150, 150)
        image.thumbnail(thumbnail_size, Image.Resampling.LANCZOS)

        # Generate unique filename
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{file_extension}"

        # Create uploads directory if it doesn't exist
        upload_dir = "uploads/profile-pictures"
        os.makedirs(upload_dir, exist_ok=True)

        # Save thumbnail
        file_path = os.path.join(upload_dir, unique_filename)
        image.save(file_path, optimize=True, quality=85)

        # Generate URL (this would be different if using S3)
        # For now, using local path - in production, upload to S3 and get URL
        profile_picture_url = f"/uploads/profile-pictures/{unique_filename}"

        # Update user's profile picture URL
        user = db.query(User).filter(User.id == int(current_user["sub"])).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Delete old profile picture file if it exists and is local
        if user.profile_picture_url and user.profile_picture_url.startswith("/uploads/"):
            old_file_path = user.profile_picture_url.lstrip("/")
            if os.path.exists(old_file_path):
                try:
                    os.remove(old_file_path)
                except Exception:
                    pass  # Ignore errors deleting old file

        user.profile_picture_url = profile_picture_url
        db.commit()

        return {
            "message": "Profile picture uploaded successfully",
            "profile_picture_url": profile_picture_url
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image file: {str(e)}"
        )


@router.delete("/profile/delete-picture", tags=["Auth"])
async def delete_profile_picture(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete profile picture for current user

    Requires: Valid JWT token
    """
    user = db.query(User).filter(User.id == int(current_user["sub"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.profile_picture_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No profile picture to delete"
        )

    # Delete file if it's local
    if user.profile_picture_url.startswith("/uploads/"):
        file_path = user.profile_picture_url.lstrip("/")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass  # Ignore errors deleting file

    user.profile_picture_url = None
    db.commit()

    return {"message": "Profile picture deleted successfully"}


# Password Strength Check Endpoint

class PasswordStrengthRequest(BaseModel):
    password: str


class PasswordStrengthResponse(BaseModel):
    score: int
    label: str
    is_valid: bool
    errors: list[str]


@router.post("/password/check-strength", response_model=PasswordStrengthResponse, tags=["Auth"])
async def check_password_strength(request: PasswordStrengthRequest):
    """
    Check password strength in real-time
    Used by frontend to show strength indicator
    """
    from app.core.password_validator import PasswordValidator

    score, label = PasswordValidator.calculate_strength(request.password)
    is_valid, errors = PasswordValidator.validate(request.password)

    return PasswordStrengthResponse(
        score=score,
        label=label,
        is_valid=is_valid,
        errors=errors
    )


# Google OAuth Endpoints

class GoogleAuthRequest(BaseModel):
    google_token: str
    tenant_name: Optional[str] = None


@router.post("/google", response_model=TokenResponse, tags=["Auth"])
async def google_oauth(
    request_body: GoogleAuthRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Authenticate with Google OAuth 2.0 / OpenID Connect (Passwordless)
    
    **Production-Ready Features:**
    - Server-side Google ID token verification (signature, aud, iss, exp, email_verified)
    - Account linking: Links Google identity to existing email-based accounts
    - Auto-creates organization for new users
    - Rate-limited to prevent abuse
    - Detailed error messages for troubleshooting
    
    **Security:**
    - Validates token server-side (not client-side only)
    - Requires email verification by Google
    - Uses unique Google user ID (sub) to prevent account conflicts
    - Logs all authentication attempts

    Args:
        request: Google ID token and optional tenant name for new users

    Returns:
        JWT token for API access with user and tenant info

    Flow:
    1. Verify Google ID token server-side (signature, aud, iss, exp, email_verified)
    2. Check if OAuth provider exists (by Google sub + provider)
    3. If not, check if user exists by email (account linking)
    4. Create new user + tenant if needed
    5. Update last login and return JWT token
    
    Raises:
        400: Invalid/expired token, unverified email
        401: Authentication failed
        500: Server error during authentication
    """
    from app.services.google_oauth import GoogleOAuthService
    from app.core.auth_rate_limiter import get_auth_rate_limiter
    
    # Rate limiting: Prevent abuse of Google OAuth endpoint
    rate_limiter = get_auth_rate_limiter()
    rate_limiter.check_google_oauth_limit(request)

    # Authenticate with Google (server-side verification)
    user, error, tenant, is_new_user = GoogleOAuthService.authenticate_with_google(
        db,
        request_body.google_token,
        request_body.tenant_name
    )

    # Handle authentication errors with detailed messages
    if error:
        logger.warning(f"Google OAuth failed: {error}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST if "token" in error.lower() or "verify" in error.lower() else status.HTTP_401_UNAUTHORIZED,
            detail=error
        )

    if not user:
        logger.error("Google OAuth: User creation/retrieval failed without error message")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed due to a server error. Please try again."
        )

    # Get user's tenant and role (only accepted memberships)
    membership = db.query(Membership).filter(
        Membership.user_id == user.id,
        Membership.invitation_status == 'accepted'
    ).first()
    if not membership:
        # Check if user has a pending invitation
        pending_membership = db.query(Membership).filter(
            Membership.user_id == user.id,
            Membership.invitation_status == 'pending'
        ).first()
        
        if pending_membership:
            logger.info(f"Google OAuth: User {user.id} has pending invitation for tenant {pending_membership.tenant_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have a pending team invitation. Please use the invitation link sent to your email to complete your registration."
            )
        
        logger.error(f"Google OAuth: User {user.id} has no accepted organization membership")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User account setup incomplete. Please contact support."
        )

    # Get tenant info if not provided (for existing users)
    if not tenant:
        tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()

    # Get user's allowed shops (creator/viewer) or empty for owner/admin
    shop_ids = membership.allowed_shop_ids or []

    # Generate JWT token with conservative expiry
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=membership.tenant_id,
        role=membership.role,
        shop_ids=shop_ids,
        remember_me=False  # Google OAuth users get standard session lifetime
    )
    refresh_tok = create_refresh_token(
        user_id=user.id, tenant_id=membership.tenant_id, role=membership.role
    )

    # Log successful authentication
    logger.info(f"Google OAuth successful: user_id={user.id}, is_new={is_new_user}, tenant_id={tenant.id}")

    body = TokenResponse(
        expires_in=settings.JWT_TTL_SECONDS,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "email_verified": user.email_verified,
            "profile_picture_url": user.profile_picture_url,
            "is_new_user": is_new_user  # For post-login onboarding detection
        },
        tenant={
            "id": tenant.id,
            "name": tenant.name,
            "role": membership.role,
            "description": tenant.description,
            "onboarding_completed": tenant.onboarding_completed,
            "messaging_access": getattr(tenant, "messaging_access", "none"),
        }
    )
    response = JSONResponse(content=body.model_dump())
    set_auth_cookies(response, access_token, refresh_tok)
    return response