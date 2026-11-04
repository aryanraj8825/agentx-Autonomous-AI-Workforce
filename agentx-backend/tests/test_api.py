"""HTTP/WebSocket tests. Need fastapi + httpx (pip install -r requirements-dev.txt); skipped otherwise."""
import time

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("JWT_SECRET", "t" * 40)
    monkeypatch.setenv("LLM_BACKEND", "mock")
    monkeypatch.setenv("DB_BACKEND", "memory")
    monkeypatch.setenv("VECTOR_BACKEND", "memory")
    monkeypatch.setenv("MOCK_LLM_FLAWS", "false")
    monkeypatch.setenv("RUNNER", "native")
    monkeypatch.setenv("FILES_DIR", str(tmp_path))
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c
    get_settings.cache_clear()


def signup(c, email="a@example.com"):
    r = c.post("/api/auth/register", json={"name": "A", "email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def wait(c, h, tid, want=("completed", "failed", "cancelled"), timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        t = c.get(f"/api/tasks/{tid}", headers=h).json()
        if t["status"] in want:
            return t
        time.sleep(0.1)
    raise AssertionError("timeout")


def test_auth_flow_and_protection(client):
    assert client.get("/api/tasks").status_code == 401
    h = signup(client)
    assert client.get("/api/auth/me", headers=h).json()["email"] == "a@example.com"
    assert client.post("/api/auth/register", json={"name": "A", "email": "A@example.com", "password": "password123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "a@example.com", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "a@example.com", "password": "password123"}).status_code == 200
    assert client.get("/api/tasks", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_task_lifecycle_and_download(client):
    h = signup(client)
    r = client.post("/api/tasks", headers=h, json={"prompt": "Research the top AI startups in India", "options": {"autonomy": "autonomous"}})
    assert r.status_code == 201
    tid = r.json()["id"]
    t = wait(client, h, tid)
    assert t["status"] == "completed" and t["deliverables"] and "logs" in t and "userId" not in t
    pdf = client.get(f"/api/tasks/{tid}/files/report.pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-"
    assert client.get(f"/api/tasks/{tid}/files/..%2F..%2Fetc%2Fpasswd", headers=h).status_code == 404
    assert any(x["id"] == tid for x in client.get("/api/tasks", headers=h).json())
    assert client.delete(f"/api/tasks/{tid}", headers=h).status_code == 200
    assert client.get(f"/api/tasks/{tid}", headers=h).status_code == 404


def test_users_cannot_see_each_others_data(client):
    a, b = signup(client, "a@example.com"), signup(client, "b@example.com")
    tid = client.post("/api/tasks", headers=a, json={"prompt": "Research the top AI startups in India", "options": {"autonomy": "autonomous"}}).json()["id"]
    wait(client, a, tid)
    assert client.get(f"/api/tasks/{tid}", headers=b).status_code == 404
    assert client.get(f"/api/tasks/{tid}/files/report.pdf", headers=b).status_code == 404
    assert client.post(f"/api/tasks/{tid}/cancel", headers=b).status_code == 404
    assert client.get("/api/tasks", headers=b).json() == []
    mid = client.post("/api/memory", headers=a, json={"type": "preference", "title": "x", "text": "secret preference"}).json()["id"]
    assert client.delete(f"/api/memory/{mid}", headers=b).status_code == 404
    assert client.post("/api/memory/search", headers=b, json={"q": "secret preference"}).json() == []


def test_approval_endpoints(client):
    h = signup(client)
    tid = client.post("/api/tasks", headers=h, json={"prompt": "Research the top AI startups in India", "options": {"autonomy": "ask"}}).json()["id"]
    t = wait(client, h, tid, want=("awaiting_approval", "completed", "failed"))
    assert t["status"] == "awaiting_approval"
    assert client.post(f"/api/tasks/{tid}/approve", headers=h, json={"nodeId": "n1"}).status_code == 409
    assert client.post(f"/api/tasks/{tid}/approve", headers=h, json={"nodeId": "n6"}).status_code == 202
    assert wait(client, h, tid)["status"] == "completed"


def test_validation_and_limits(client):
    h = signup(client)
    assert client.post("/api/tasks", headers=h, json={"prompt": "short"}).status_code == 422
    assert client.post("/api/tasks", headers=h, json={"prompt": "x" * 20, "options": {"tokenBudget": 1}}).status_code == 422
    assert client.post("/api/auth/register", json={"name": "A", "email": "bad", "password": "password123"}).status_code == 422


def test_websocket_requires_token_and_streams(client):
    h = signup(client)
    token = h["Authorization"].split()[1]
    with pytest.raises(Exception):
        with client.websocket_connect("/ws?token=bad"):
            pass
    with client.websocket_connect(f"/ws?token={token}") as ws:
        assert ws.receive_json()["type"] == "ready"
        client.post("/api/tasks", headers=h, json={"prompt": "Research the top AI startups in India", "options": {"autonomy": "autonomous"}})
        seen = set()
        for _ in range(400):
            seen.add(ws.receive_json()["type"])
            if {"task.updated", "log.added"} <= seen:
                break
        assert {"task.updated", "log.added"} <= seen


def test_integrations_never_return_secrets(client):
    h = signup(client)
    r = client.post("/api/integrations/slack/connect", headers=h, json={"fields": {"Webhook URL": "https://hooks.example.com/SECRET123"}})
    assert r.status_code == 200 and "SECRET123" not in r.text and r.json()["connected"]
    assert "SECRET123" not in client.get("/api/integrations", headers=h).text
    assert client.post("/api/integrations/mongodb/connect", headers=h, json={"fields": {}}).status_code == 422


def test_analytics_and_agents(client):
    h = signup(client)
    assert client.get("/api/analytics?days=7", headers=h).json()["totals"]["tasks"] == 0
    a = client.get("/api/agents", headers=h).json()
    assert len(a["agents"]) == 7
    assert client.patch("/api/agents/writer/config", headers=h, json={"temperature": 0.2, "maxRetries": 3}).json()["temperature"] == 0.2
    assert client.patch("/api/agents/writer/config", headers=h, json={"model": "gpt-9"}).status_code == 422
