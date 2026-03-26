"""
Etsy OAuth 2.0 Service
Handles authorization flow and token management
"""
import json
import httpx
import secrets
import hashlib
import base64
from typing import Dict, Optional
from datetime import datetime, timedelta
from urllib.parse import urlencode

from app.core.config import settings


def _parse_etsy_token_error(response: httpx.Response) -> str:
    """
    Parse Etsy token endpoint error response (RFC 6749 style).
    Returns a user-friendly message when error/error_description are present.
    """
    try:
        body = response.json()
    except (json.JSONDecodeError, ValueError):
        return f"Etsy token refresh failed: {response.status_code} {response.text}"
    error = body.get("error", "")
    desc = body.get("error_description", "")
    if error == "invalid_grant" or "refresh" in (error + desc).lower():
        return "Refresh token expired. Reconnect Etsy to grant permissions."
    if desc:
        return desc
    if error:
        return f"Etsy OAuth error: {error}"
    return f"Etsy token refresh failed: {response.status_code} {response.text}"


class EtsyOAuthService:
    """Handle Etsy OAuth 2.0 flow"""
    
    BASE_URL = "https://openapi.etsy.com/v3"
    AUTH_URL = "https://www.etsy.com/oauth/connect"
    TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token"
    
    # Standard Etsy OAuth 2.0 scopes
    SCOPES = [
        "listings_r",      # Read listings
        "listings_w",      # Write/create listings
        "listings_d",      # Delete listings
        "transactions_r",  # Read orders/transactions
        "transactions_w",  # Update orders/fulfillment
        "shops_r",         # Read shop information
        "profile_r",       # Read user profile
        "billing_r",       # Read billing/fees data for financial analytics
    ]
    
    def __init__(self):
        self.client_id = settings.ETSY_CLIENT_ID
        self.client_secret = settings.ETSY_CLIENT_SECRET
        self.redirect_uri = settings.ETSY_REDIRECT_URI

    @property
    def api_key_header(self) -> str:
        """Etsy v3 API x-api-key format: {keystring}:{shared_secret}"""
        if self.client_secret:
            return f"{self.client_id}:{self.client_secret}"
        return self.client_id
    
    def get_authorization_url(self, state: str = None) -> Dict[str, str]:
        """
        Generate Etsy authorization URL with PKCE

        Args:
            state: Random state for CSRF protection (generated if not provided)

        Returns:
            Dict with 'auth_url', 'state', and 'code_verifier'
        """
        if not state:
            state = secrets.token_urlsafe(32)

        # Generate PKCE code verifier and challenge
        code_verifier = secrets.token_urlsafe(32)

        # Create SHA256 hash of code_verifier
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode('utf-8')).digest()
        ).decode('utf-8').rstrip('=')

        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": " ".join(self.SCOPES),
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }

        auth_url = f"{self.AUTH_URL}?{urlencode(params)}"

        return {
            "auth_url": auth_url,
            "state": state,
            "code_verifier": code_verifier
        }

    async def exchange_code_for_token(self, code: str, code_verifier: str = None) -> Dict:
        """
        Exchange authorization code for access token

        Args:
            code: Authorization code from Etsy callback
            code_verifier: PKCE verifier (if used)

        Returns:
            Dict with access_token, refresh_token, expires_in
        """
        if not self.client_id or not self.redirect_uri:
            raise Exception("Etsy OAuth is not configured. Missing client_id or redirect_uri.")

        data = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "code": code,
        }

        if code_verifier:
            data["code_verifier"] = code_verifier
        if self.client_secret:
            data["client_secret"] = self.client_secret

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data=data,
                headers={
                    "x-api-key": self.api_key_header,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            if response.status_code >= 400:
                # Include Etsy response body to aid debugging (redact secrets upstream).
                raise Exception(f"Etsy token exchange failed: {response.status_code} {response.text}")
            return response.json()

    async def refresh_access_token(self, refresh_token: str) -> Dict:
        """
        Refresh an expired access token

        Args:
            refresh_token: Refresh token from initial OAuth flow

        Returns:
            Dict with new access_token, refresh_token, expires_in
        """
        data = {
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "refresh_token": refresh_token,
        }
        if self.client_secret:
            data["client_secret"] = self.client_secret

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data=data,
                headers={
                    "x-api-key": self.api_key_header,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            if response.status_code >= 400:
                msg = _parse_etsy_token_error(response)
                raise Exception(msg)
            return response.json()

    async def get_shop_info(self, access_token: str) -> Dict:
        """
        Get authenticated user's shop information

        Args:
            access_token: Valid Etsy access token

        Returns:
            Shop information dict
        """
        headers = {
            "Authorization": f"Bearer {access_token}",
            "x-api-key": self.api_key_header,
            "Accept": "application/json",
        }

        async with httpx.AsyncClient() as client:
            # Get current user
            user_response = await client.get(
                f"{self.BASE_URL}/application/users/me",
                headers=headers
            )
            if user_response.status_code >= 400:
                raise Exception(f"Etsy get user failed: {user_response.status_code} {user_response.text}")
            user_data = user_response.json()
            user_id = user_data.get("user_id")
            shop_id = user_data.get("shop_id")

            # Preferred path: fetch shops by user_id
            if user_id:
                shops_response = await client.get(
                    f"{self.BASE_URL}/application/users/{user_id}/shops",
                    headers=headers
                )
                if shops_response.status_code >= 400:
                    raise Exception(f"Etsy get shops failed: {shops_response.status_code} {shops_response.text}")
                data = shops_response.json()

                # Return first shop (most users have one)
                if data.get("results"):
                    return data["results"][0]

            # Fallback: some Etsy accounts return shop_id on /users/me
            if shop_id:
                shop_response = await client.get(
                    f"{self.BASE_URL}/application/shops/{shop_id}",
                    headers=headers
                )
                if shop_response.status_code >= 400:
                    raise Exception(f"Etsy get shop failed: {shop_response.status_code} {shop_response.text}")
                return shop_response.json()

            raise Exception("No shops found for this user")


# Global instance
etsy_oauth = EtsyOAuthService()