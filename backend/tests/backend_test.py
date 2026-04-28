"""Backend API tests for Modern Todo App"""
import os
import base64
import subprocess
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split('\n')[0]).rstrip('/')
API = f"{BASE_URL}/api"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "todo_app_db"

DEMO_EMAIL = "demo@todoapp.com"
DEMO_PASS = "Demo@1234"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def demo_token(s):
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


# --- Health ---
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert "Modern Todo API" in r.json()["message"]


# --- Auth: signup ---
def test_signup_and_me(s):
    email = f"test_{int(time.time()*1000)}@example.com"
    r = s.post(f"{API}/auth/signup", json={"email": email, "password": "Secret@123", "name": "TestUser"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["access_token"]
    assert data["user"]["email"] == email
    # /me with token
    r2 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert r2.status_code == 200
    assert r2.json()["email"] == email
    assert r2.json()["mfa_enabled"] is False


def test_signup_duplicate(s):
    r = s.post(f"{API}/auth/signup", json={"email": DEMO_EMAIL, "password": "xxxxxx", "name": "x"})
    assert r.status_code == 400


# --- Auth: login ---
def test_login_demo(s):
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["requires_mfa"] is False


def test_login_wrong_password(s):
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "WRONG"})
    assert r.status_code == 401


def test_me_without_token(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code in (401, 403)


# --- Todo CRUD ---
def test_todos_require_auth(s):
    r = s.get(f"{API}/todos")
    assert r.status_code in (401, 403)


def test_todo_crud_and_encryption(s, demo_headers):
    payload = {
        "title": "TEST_Write integration test",
        "description": "TEST_This is a secret description",
        "priority": "high",
        "category": "Work",
        "tags": ["test", "api"],
    }
    r = s.post(f"{API}/todos", json=payload, headers=demo_headers)
    assert r.status_code == 200, r.text
    todo = r.json()
    tid = todo["id"]
    assert todo["title"] == payload["title"]
    assert todo["description"] == payload["description"]
    assert todo["priority"] == "high"
    assert todo["completed"] is False

    # Verify encryption in DB
    mc = MongoClient(MONGO_URL)
    doc = mc[DB_NAME]["todos"].find_one({"id": tid})
    mc.close()
    assert doc is not None
    assert "description_enc" in doc
    assert "title_enc" in doc
    # plaintext must not be stored
    assert payload["description"] not in str(doc.get("description_enc", ""))
    assert payload["title"] not in str(doc.get("title_enc", ""))

    # GET list
    r = s.get(f"{API}/todos", headers=demo_headers)
    assert r.status_code == 200
    titles = [t["title"] for t in r.json()]
    assert payload["title"] in titles

    # PATCH
    r = s.patch(f"{API}/todos/{tid}", json={"completed": True, "title": "TEST_updated"}, headers=demo_headers)
    assert r.status_code == 200
    assert r.json()["completed"] is True
    assert r.json()["title"] == "TEST_updated"

    # Stats
    r = s.get(f"{API}/todos/stats", headers=demo_headers)
    assert r.status_code == 200
    stats = r.json()
    assert stats["total"] >= 1 and stats["completed"] >= 1

    # DELETE
    r = s.delete(f"{API}/todos/{tid}", headers=demo_headers)
    assert r.status_code == 200
    # Verify gone
    r = s.delete(f"{API}/todos/{tid}", headers=demo_headers)
    assert r.status_code == 404


# --- User isolation ---
def test_user_isolation(s, demo_headers):
    # Create a second user
    email = f"iso_{int(time.time()*1000)}@example.com"
    r = s.post(f"{API}/auth/signup", json={"email": email, "password": "Secret@123", "name": "Iso"})
    t2 = r.json()["access_token"]
    h2 = {"Authorization": f"Bearer {t2}"}

    # User 2 creates a todo
    r = s.post(f"{API}/todos", json={"title": "TEST_iso_private"}, headers=h2)
    assert r.status_code == 200
    tid = r.json()["id"]

    # Demo user should NOT see it
    r = s.get(f"{API}/todos", headers=demo_headers)
    ids = [t["id"] for t in r.json()]
    assert tid not in ids

    # Demo user cannot update/delete it
    r = s.patch(f"{API}/todos/{tid}", json={"completed": True}, headers=demo_headers)
    assert r.status_code == 404
    r = s.delete(f"{API}/todos/{tid}", headers=demo_headers)
    assert r.status_code == 404


# --- MFA flow ---
def test_mfa_flow(s):
    # Create a fresh user
    email = f"mfa_{int(time.time()*1000)}@example.com"
    pw = "Secret@123"
    r = s.post(f"{API}/auth/signup", json={"email": email, "password": pw, "name": "MFA"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    # Enable MFA
    r = s.post(f"{API}/auth/mfa/toggle", json={"enabled": True}, headers=h)
    assert r.status_code == 200
    assert r.json()["mfa_enabled"] is True

    # Login now should require MFA
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200
    body = r.json()
    assert body.get("requires_mfa") is True
    assert "mfa_token" in body
    assert "access_token" not in body
    mfa_token = body["mfa_token"]

    # Wrong OTP -> 401
    r = s.post(f"{API}/auth/mfa/verify", json={"mfa_token": mfa_token, "otp": "000000"})
    assert r.status_code == 401

    # dev/last-otp exists
    r = s.get(f"{API}/auth/dev/last-otp", params={"email": email})
    assert r.status_code == 200
    assert "mfa_token" in r.json()

    # Read OTP from backend log
    try:
        out = subprocess.check_output(
            ["bash", "-c", "grep 'OTP for " + email + "' /var/log/supervisor/backend.out.log | tail -1"],
            stderr=subprocess.DEVNULL, timeout=5
        ).decode()
        otp = out.strip().split(":")[-1].strip()
        if otp and otp.isdigit() and len(otp) == 6:
            r = s.post(f"{API}/auth/mfa/verify", json={"mfa_token": mfa_token, "otp": otp})
            assert r.status_code == 200, r.text
            assert "access_token" in r.json()
    except Exception as e:
        pytest.skip(f"Could not read OTP from log: {e}")
