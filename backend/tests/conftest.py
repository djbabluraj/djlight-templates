import os
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

# Load frontend env to get EXPO_PUBLIC_BACKEND_URL (preview URL)
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")

ADMIN_EMAIL = "admin@djlights.com"
ADMIN_PASSWORD = "DjLights2026!"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_session():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def admin_token(api_session):
    r = api_session.post(
        f"{BASE_URL}/api/admin/login",
        data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
