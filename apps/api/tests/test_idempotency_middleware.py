import json
from fastapi.testclient import TestClient


def test_missing_idempotency_key_rejected(client: TestClient):
    response = client.post("/api/auth/login", json={"email": "x@test.com", "password": "x"})
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"


def test_idempotency_key_cached_response(client: TestClient, monkeypatch):
    from app.middleware import idempotency as idem_module

    class FakeRedis:
        def __init__(self):
            self.store = {}

        def get(self, key):
            return self.store.get(key)

        def setex(self, key, ttl, value):
            self.store[key] = value
            return True

    fake = FakeRedis()
    monkeypatch.setattr(idem_module, "get_redis_client", lambda: fake)

    headers = {"Idempotency-Key": "test-key-1"}
    first = client.post("/api/auth/login", json={"email": "x@test.com", "password": "x"}, headers=headers)
    second = client.post("/api/auth/login", json={"email": "x@test.com", "password": "x"}, headers=headers)

    assert first.status_code == second.status_code
    assert first.json() == second.json()
