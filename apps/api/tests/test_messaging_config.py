from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.endpoints import shops as shops_endpoints


def _build_test_app(db):
    app = FastAPI()
    app.include_router(shops_endpoints.router, prefix="/api/shops")

    def _fake_db():
        yield db

    app.dependency_overrides[shops_endpoints.get_db] = _fake_db

    # Override permission dependencies used by messaging routes.
    for route in app.routes:
        if getattr(route, "path", "").endswith("/messaging-config"):
            for dep in route.dependant.dependencies:
                if dep.call is not shops_endpoints.get_db:
                    app.dependency_overrides[dep.call] = lambda: SimpleNamespace(
                        tenant_id=1, user_id=1, role="owner", allowed_shop_ids=[1]
                    )
    return app


def _db_with_shop(shop):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = shop
    return db


def test_get_messaging_config_valid_shop_returns_config_without_password():
    shop = SimpleNamespace(
        id=1,
        tenant_id=1,
        imap_host="imap.gmail.com",
        imap_email="a@b.com",
        imap_password_enc=b"secret",
        adspower_profile_id="prof-1",
    )
    db = _db_with_shop(shop)
    app = _build_test_app(db)
    client = TestClient(app)

    resp = client.get("/api/shops/1/messaging-config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["imap_host"] == "imap.gmail.com"
    assert body["imap_email"] == "a@b.com"
    assert "imap_password" not in body
    assert "imap_password_enc" not in body


def test_get_messaging_config_404_for_missing_or_unauthorized_shop():
    db = _db_with_shop(None)
    app = _build_test_app(db)
    client = TestClient(app)

    resp = client.get("/api/shops/999/messaging-config")
    assert resp.status_code == 404


def test_patch_updates_fields_encrypts_password_and_publishes_reload():
    shop = SimpleNamespace(
        id=1,
        tenant_id=1,
        imap_host="",
        imap_email="",
        imap_password_enc=None,
        adspower_profile_id="",
        updated_at=datetime.now(timezone.utc),
    )
    db = _db_with_shop(shop)
    app = _build_test_app(db)
    client = TestClient(app)

    redis_mock = MagicMock()
    shops_endpoints.redis_client = redis_mock

    resp = client.patch(
        "/api/shops/1/messaging-config",
        json={
            "imap_host": "imap.gmail.com",
            "imap_email": "shop@test.com",
            "imap_password": "app-pass",
            "adspower_profile_id": "profile-7",
        },
    )
    assert resp.status_code == 200
    assert shop.imap_host == "imap.gmail.com"
    assert shop.imap_email == "shop@test.com"
    assert shop.adspower_profile_id == "profile-7"
    assert shop.imap_password_enc is not None
    redis_mock.publish.assert_called_once_with("imap:reload", "reload")


def test_patch_skips_password_update_when_empty_or_omitted():
    existing = b"existing-enc"
    shop = SimpleNamespace(
        id=1,
        tenant_id=1,
        imap_host="old",
        imap_email="old@x.com",
        imap_password_enc=existing,
        adspower_profile_id="old-prof",
        updated_at=datetime.now(timezone.utc),
    )
    db = _db_with_shop(shop)
    app = _build_test_app(db)
    client = TestClient(app)

    resp = client.patch(
        "/api/shops/1/messaging-config",
        json={"imap_host": "new", "imap_password": ""},
    )
    assert resp.status_code == 200
    assert shop.imap_host == "new"
    assert shop.imap_password_enc == existing

