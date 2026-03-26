"""
Tests for POST /api/shops/{shop_id}/refresh-token endpoint
"""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock

from app.models.tenancy import OAuthToken
from app.services.encryption import token_encryptor
from app.services.token_manager import TokenRefreshError
from tests.conftest import create_auth_headers


class TestShopsRefreshTokenEndpoint:
    """Test the manual token refresh endpoint"""

    def test_refresh_token_success_returns_200_with_expires_at(
        self, client, db, tenant, shop, owner_user, access_token
    ):
        """Test successful refresh returns 200 with expires_at"""
        from app.models.tenancy import Shop

        # Ensure shop has OAuth token with refresh_token
        oauth = OAuthToken(
            tenant_id=tenant.id,
            shop_id=shop.id,
            provider="etsy",
            access_token=token_encryptor.encrypt("old_access"),
            refresh_token=token_encryptor.encrypt("valid_refresh"),
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=10),
            scopes="billing_r",
        )
        db.add(oauth)
        db.commit()

        with (
            patch("app.api.endpoints.shops.check_rate_limit", return_value=True),
            patch("app.api.endpoints.shops.TokenManager") as MockTokenManager,
        ):
            mock_manager = AsyncMock()
            mock_manager.refresh_token.return_value = "new_access_token"
            MockTokenManager.return_value = mock_manager

            response = client.post(
                f"/api/shops/{shop.id}/refresh-token",
                headers=create_auth_headers(access_token),
            )

        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "expires_at" in data
        assert "Token refreshed" in data["message"] or "success" in data["message"].lower()

    def test_refresh_token_failure_returns_401_with_reconnect_message(
        self, client, db, tenant, shop, owner_user, access_token
    ):
        """Test TokenRefreshError returns 401 with Reconnect in detail"""
        oauth = OAuthToken(
            tenant_id=tenant.id,
            shop_id=shop.id,
            provider="etsy",
            access_token=token_encryptor.encrypt("old_access"),
            refresh_token=token_encryptor.encrypt("valid_refresh"),
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=10),
            scopes="billing_r",
        )
        db.add(oauth)
        db.commit()

        with (
            patch("app.api.endpoints.shops.check_rate_limit", return_value=True),
            patch("app.api.endpoints.shops.TokenManager") as MockTokenManager,
        ):
            mock_manager = AsyncMock()
            mock_manager.refresh_token.side_effect = TokenRefreshError(
                "Failed to refresh token: Refresh token expired"
            )
            MockTokenManager.return_value = mock_manager

            response = client.post(
                f"/api/shops/{shop.id}/refresh-token",
                headers=create_auth_headers(access_token),
            )

        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "reconnect" in data["detail"].lower()

    def test_refresh_token_no_refresh_token_returns_400(
        self, client, db, tenant, shop, owner_user, access_token
    ):
        """Test when TokenManager returns None (no refresh token) returns 400"""
        oauth = OAuthToken(
            tenant_id=tenant.id,
            shop_id=shop.id,
            provider="etsy",
            access_token=token_encryptor.encrypt("old_access"),
            refresh_token=None,  # No refresh token
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=10),
            scopes="billing_r",
        )
        db.add(oauth)
        db.commit()

        with (
            patch("app.api.endpoints.shops.check_rate_limit", return_value=True),
            patch("app.api.endpoints.shops.TokenManager") as MockTokenManager,
        ):
            mock_manager = AsyncMock()
            mock_manager.refresh_token.return_value = None
            MockTokenManager.return_value = mock_manager

            response = client.post(
                f"/api/shops/{shop.id}/refresh-token",
                headers=create_auth_headers(access_token),
            )

        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "refresh" in data["detail"].lower()
