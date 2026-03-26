"""
Google OAuth Service
Handles Google OAuth 2.0 authentication flow
"""
import logging
import httpx
import secrets
from typing import Dict, Optional, Tuple
from datetime import datetime, timezone
from google.oauth2 import id_token
from google.auth.transport import requests
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.tenancy import User, Tenant, Membership

logger = logging.getLogger(__name__)


class GoogleOAuthService:
    """Service for Google OAuth authentication"""
    
    def __init__(self):
        self.client_id = settings.GOOGLE_CLIENT_ID
        self.client_secret = settings.GOOGLE_CLIENT_SECRET
        self.redirect_uri = settings.GOOGLE_REDIRECT_URI
        self.auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
        self.token_url = "https://oauth2.googleapis.com/token"
        self.userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"
    
    def get_authorization_url(self, state: str, invitation_token: Optional[str] = None) -> str:
        """
        Generate Google OAuth authorization URL
        
        Args:
            state: Random state parameter for CSRF protection
            invitation_token: Optional invitation token to pass through OAuth flow
        
        Returns:
            Authorization URL to redirect user to
        """
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account"
        }
        
        # If invitation token provided, include it in state
        if invitation_token:
            params["state"] = f"{state}:{invitation_token}"
        
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{self.auth_url}?{query_string}"
    
    async def exchange_code_for_token(self, code: str) -> Dict:
        """
        Exchange authorization code for access token
        
        Args:
            code: Authorization code from Google
        
        Returns:
            Token response from Google
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": self.redirect_uri
                }
            )
            if not response.is_success:
                body = response.text
                logger.warning(
                    "REJECT: Google token exchange failed. status=%s body=%s redirect_uri=%s",
                    response.status_code, body[:500] if body else "(empty)", self.redirect_uri
                )
            response.raise_for_status()
            return response.json()
    
    async def get_user_info(self, access_token: str) -> Dict:
        """
        Get user information from Google using access token
        
        Args:
            access_token: Google OAuth access token
        
        Returns:
            User information from Google
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.userinfo_url,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            response.raise_for_status()
            return response.json()
    
    @staticmethod
    def authenticate_with_google(
        db: Session,
        google_token: str,
        tenant_name: Optional[str] = None
    ) -> Tuple[Optional[User], Optional[str], Optional[Tenant], bool]:
        """
        Authenticate user with Google OAuth token (for regular login)
        
        Args:
            db: Database session
            google_token: Google access token from frontend
            tenant_name: Optional tenant name for new users
        
        Returns:
            Tuple of (User, error_message, Tenant, is_new_user)
        """
        try:
            # Verify the Google token by fetching user info
            response = httpx.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {google_token}'},
                timeout=10.0
            )
            
            if response.status_code != 200:
                return None, "Invalid or expired Google token", None, False
            
            user_info = response.json()
            email = user_info.get('email')
            google_user_id = user_info.get('sub')
            name = user_info.get('name')
            picture = user_info.get('picture')
            email_verified = user_info.get('email_verified', False)
            
            if not email or not google_user_id:
                return None, "Email or user ID not provided by Google", None, False
            
            if not email_verified:
                return None, "Email not verified by Google", None, False
            
            # Check if user exists by Google ID
            user = db.query(User).filter(
                User.oauth_provider == 'google',
                User.oauth_provider_user_id == google_user_id
            ).first()
            
            is_new_user = False
            tenant = None
            
            if user:
                # Existing user - update last login
                user.last_login_at = datetime.now(timezone.utc)
                user.profile_picture_url = picture or user.profile_picture_url
                db.commit()
                
                # Get tenant
                membership = db.query(Membership).filter(
                    Membership.user_id == user.id
                ).first()
                if membership:
                    tenant = db.query(Tenant).filter(
                        Tenant.id == membership.tenant_id
                    ).first()
            else:
                # Check if user exists by email (account linking)
                user = db.query(User).filter(User.email == email).first()
                
                if user:
                    # Link existing email account to Google
                    user.oauth_provider = 'google'
                    user.oauth_provider_user_id = google_user_id
                    user.profile_picture_url = picture or user.profile_picture_url
                    user.email_verified = True
                    user.last_login_at = datetime.now(timezone.utc)
                    db.commit()
                    
                    # Get tenant
                    membership = db.query(Membership).filter(
                        Membership.user_id == user.id
                    ).first()
                    if membership:
                        tenant = db.query(Tenant).filter(
                            Tenant.id == membership.tenant_id
                        ).first()
                else:
                    # Create new user and tenant
                    is_new_user = True
                    
                    # Create tenant
                    tenant = Tenant(
                        name=tenant_name or f"{name}'s Organization",
                        description=None,
                        onboarding_completed=False,
                        billing_tier='starter',
                        status='active',
                        created_at=datetime.now(timezone.utc)
                    )
                    db.add(tenant)
                    db.flush()
                    
                    # Create user
                    user = User(
                        email=email,
                        name=name,
                        profile_picture_url=picture,
                        oauth_provider='google',
                        oauth_provider_user_id=google_user_id,
                        email_verified=True,
                        password_hash=None,
                        created_at=datetime.now(timezone.utc),
                        last_login_at=datetime.now(timezone.utc)
                    )
                    db.add(user)
                    db.flush()
                    
                    # Create membership
                    membership = Membership(
                        user_id=user.id,
                        tenant_id=tenant.id,
                        role='owner',
                        invitation_status='accepted',
                        created_at=datetime.now(timezone.utc)
                    )
                    db.add(membership)
                    db.commit()
            
            return user, None, tenant, is_new_user
            
        except httpx.HTTPError as e:
            return None, "Failed to verify Google token", None, False
        except Exception as e:
            db.rollback()
            logger.exception("Google OAuth authentication failed: %s", e)
            return None, f"Authentication error: {str(e)}", None, False
    
    @staticmethod
    def generate_state() -> str:
        """Generate a random state parameter for CSRF protection"""
        return secrets.token_urlsafe(32)


# Global instance
google_oauth_service = GoogleOAuthService()
