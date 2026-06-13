"""Backend API tests for ebook reader & editor.

Covers:
- GET /api/ root health
- POST /api/ai/suggest — all 4 modes, session_id stickiness, empty-context 400
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://text-craft-28.preview.emergentagent.com").rstrip("/")
TIMEOUT = 60  # AI calls can be slow

CONTEXT = (
    "The corridor was longer than she remembered. Each footstep echoed against the marble, "
    "and the chandeliers cast pale, shaking light on the velvet walls."
)


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        s.headers.update({"Authorization": f"Bearer {key}"})
    return s


# ---------- Health ----------
class TestHealth:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "message" in body
        assert isinstance(body["message"], str) and len(body["message"]) > 0


# ---------- AI Suggest ----------
@pytest.mark.parametrize("mode", ["continue", "improve", "shorten", "expand"])
def test_ai_suggest_modes_return_nonempty(api, mode):
    payload = {"context": CONTEXT, "mode": mode}
    r = api.post(f"{BASE_URL}/api/ai/suggest", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, f"{mode}: {r.status_code} {r.text}"
    data = r.json()
    assert "suggestion" in data and "session_id" in data
    assert isinstance(data["suggestion"], str)
    assert len(data["suggestion"].strip()) > 0, f"{mode} returned empty suggestion"
    assert isinstance(data["session_id"], str) and len(data["session_id"]) > 0


def test_ai_suggest_session_sticky(api):
    """When a session_id is passed, the API must echo back the same id."""
    sid = "TEST_session_sticky_abc123"
    r1 = api.post(
        f"{BASE_URL}/api/ai/suggest",
        json={"context": CONTEXT, "mode": "continue", "session_id": sid},
        timeout=TIMEOUT,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["session_id"] == sid

    # Second call with same session_id should also keep it
    r2 = api.post(
        f"{BASE_URL}/api/ai/suggest",
        json={"context": CONTEXT, "mode": "improve", "session_id": sid},
        timeout=TIMEOUT,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["session_id"] == sid


def test_ai_suggest_empty_context_returns_400(api):
    r = api.post(
        f"{BASE_URL}/api/ai/suggest",
        json={"context": "", "mode": "continue"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code} ({r.text})"


def test_ai_suggest_whitespace_context_returns_400(api):
    r = api.post(
        f"{BASE_URL}/api/ai/suggest",
        json={"context": "    \n\t  ", "mode": "continue"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code} ({r.text})"
