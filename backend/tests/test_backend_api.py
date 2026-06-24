"""DJ Light Templates - Backend API tests (new schema: category/download_link/media_type)."""
import base64
import os
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

_PX_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YA"
    "AAAASUVORK5CYII="
)
_IMG_DATA_URI = f"data:image/png;base64,{_PX_PNG_B64}"
_VID_DATA_URI = "data:video/mp4;base64," + base64.b64encode(b"fakevid").decode()


# ---- Public templates endpoints (new schema) ----
class TestPublicTemplates:
    def test_root(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_list_templates_returns_seeded(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/templates")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 4, f"Expected >=4 seeded templates, got {len(data)}"
        first = data[0]
        # New schema fields
        for f in ("id", "title", "category", "template_type", "price",
                  "download_link", "media_type", "thumbnail_base64",
                  "video_base64", "downloads", "created_at"):
            assert f in first, f"Missing field {f}"
        # Old removed fields
        for removed in ("file_base64", "file_name", "file_mime", "file_size", "_id"):
            assert removed not in first, f"Field {removed} should not be exposed"
        # Default seeded items have category set to "AV Player Template"
        # (Note: video_base64 may be populated for video templates; not asserted here)
        seeded = next((t for t in data if t.get("title") == "Neon Pulse Pack"), None)
        if seeded:
            assert seeded["category"] == "AV Player Template"
            assert seeded["video_base64"] == ""

    def test_filter_free(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/templates?type=free")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert all(t["template_type"] == "free" for t in data)

    def test_filter_premium(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/templates?type=premium")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert all(t["template_type"] == "premium" for t in data)

    def test_get_template_detail(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/templates")
        tid = r.json()[0]["id"]
        r2 = api_session.get(f"{BASE_URL}/api/templates/{tid}")
        assert r2.status_code == 200
        body = r2.json()
        assert body["id"] == tid
        assert "_id" not in body

    def test_get_template_404(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/templates/nonexistent-id-xyz")
        assert r.status_code == 404

    def test_track_download_increments(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/templates")
        t = r.json()[0]
        tid, before = t["id"], t["downloads"]
        d = api_session.post(f"{BASE_URL}/api/templates/{tid}/track-download")
        assert d.status_code == 200
        assert d.json().get("ok") is True
        after = api_session.get(f"{BASE_URL}/api/templates/{tid}").json()["downloads"]
        assert after == before + 1

    def test_track_download_404_for_missing(self, api_session):
        r = api_session.post(f"{BASE_URL}/api/templates/nonexistent-xyz/track-download")
        assert r.status_code == 404


# ---- Notifications ----
class TestNotifications:
    def test_list_notifications(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/notifications")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---- Admin auth ----
class TestAdminAuth:
    def test_login_success(self, api_session):
        r = api_session.post(
            f"{BASE_URL}/api/admin/login",
            data={"username": "admin@djlights.com", "password": "DjLights2026!"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body and body.get("token_type") == "bearer"

    def test_login_wrong_password(self, api_session):
        r = api_session.post(
            f"{BASE_URL}/api/admin/login",
            data={"username": "admin@djlights.com", "password": "WRONG"},
        )
        assert r.status_code == 401

    def test_me_requires_token(self, api_session):
        r = api_session.get(f"{BASE_URL}/api/admin/me")
        assert r.status_code == 401

    def test_me_with_token(self, api_session, auth_headers):
        r = api_session.get(f"{BASE_URL}/api/admin/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == "admin@djlights.com"


# ---- Admin CRUD (new schema) ----
class TestAdminCRUD:
    def _create_image(self, api_session, auth_headers, title="TEST_Image"):
        payload = {
            "title": title,
            "category": "AV Player Template",
            "template_type": "free",
            "price": 0.0,
            "description": "TEST image template",
            "download_link": "https://example.com/test.zip",
            "media_type": "image",
            "thumbnail_base64": _IMG_DATA_URI,
            "video_base64": "",
        }
        r = api_session.post(f"{BASE_URL}/api/admin/templates",
                             json=payload, headers=auth_headers)
        return r

    def _create_video(self, api_session, auth_headers, title="TEST_Video"):
        payload = {
            "title": title,
            "category": "AV Player Template",
            "template_type": "premium",
            "price": 2.99,
            "description": "TEST video template",
            "download_link": "https://example.com/test-vid.zip",
            "media_type": "video",
            "thumbnail_base64": "",
            "video_base64": _VID_DATA_URI,
        }
        r = api_session.post(f"{BASE_URL}/api/admin/templates",
                             json=payload, headers=auth_headers)
        return r

    def test_create_image_template(self, api_session, auth_headers):
        r = self._create_image(api_session, auth_headers, "TEST_CreateImg")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "TEST_CreateImg"
        assert body["category"] == "AV Player Template"
        assert body["download_link"] == "https://example.com/test.zip"
        assert body["media_type"] == "image"
        assert body["thumbnail_base64"] == _IMG_DATA_URI
        assert body["video_base64"] == ""
        # Cleanup
        api_session.delete(f"{BASE_URL}/api/admin/templates/{body['id']}", headers=auth_headers)

    def test_create_video_template_clears_thumb(self, api_session, auth_headers):
        r = self._create_video(api_session, auth_headers, "TEST_CreateVid")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["media_type"] == "video"
        assert body["video_base64"] == _VID_DATA_URI
        assert body["thumbnail_base64"] == ""
        api_session.delete(f"{BASE_URL}/api/admin/templates/{body['id']}", headers=auth_headers)

    def test_image_requires_thumbnail(self, api_session, auth_headers):
        payload = {
            "title": "TEST_NoThumb", "category": "AV Player Template",
            "template_type": "free", "price": 0.0,
            "download_link": "https://example.com/x.zip",
            "media_type": "image", "thumbnail_base64": "", "video_base64": "",
        }
        r = api_session.post(f"{BASE_URL}/api/admin/templates", json=payload, headers=auth_headers)
        assert r.status_code == 400

    def test_video_requires_video_base64(self, api_session, auth_headers):
        payload = {
            "title": "TEST_NoVid", "category": "AV Player Template",
            "template_type": "free", "price": 0.0,
            "download_link": "https://example.com/x.zip",
            "media_type": "video", "thumbnail_base64": "", "video_base64": "",
        }
        r = api_session.post(f"{BASE_URL}/api/admin/templates", json=payload, headers=auth_headers)
        assert r.status_code == 400

    def test_patch_title_only(self, api_session, auth_headers):
        c = self._create_image(api_session, auth_headers, "TEST_PatchTitle")
        tid = c.json()["id"]
        r = api_session.patch(f"{BASE_URL}/api/admin/templates/{tid}",
                              json={"title": "TEST_PatchedTitle"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_PatchedTitle"
        # Verify persistence
        g = api_session.get(f"{BASE_URL}/api/templates/{tid}").json()
        assert g["title"] == "TEST_PatchedTitle"
        api_session.delete(f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers)

    def test_patch_image_to_video_swap(self, api_session, auth_headers):
        c = self._create_image(api_session, auth_headers, "TEST_SwapImg2Vid")
        tid = c.json()["id"]
        original_thumb = c.json()["thumbnail_base64"]
        r = api_session.patch(
            f"{BASE_URL}/api/admin/templates/{tid}",
            json={"media_type": "video", "video_base64": _VID_DATA_URI},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["media_type"] == "video"
        assert body["video_base64"] == _VID_DATA_URI
        # Image thumb is preserved as the video card poster (new behavior).
        assert body["thumbnail_base64"] == original_thumb
        api_session.delete(f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers)

    def test_patch_video_to_image_swap(self, api_session, auth_headers):
        c = self._create_video(api_session, auth_headers, "TEST_SwapVid2Img")
        tid = c.json()["id"]
        r = api_session.patch(
            f"{BASE_URL}/api/admin/templates/{tid}",
            json={"media_type": "image", "thumbnail_base64": _IMG_DATA_URI},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["media_type"] == "image"
        assert body["thumbnail_base64"] == _IMG_DATA_URI
        assert body["video_base64"] == ""
        api_session.delete(f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers)

    def test_patch_to_free_zeroes_price(self, api_session, auth_headers):
        c = self._create_video(api_session, auth_headers, "TEST_FreeZero")
        tid = c.json()["id"]
        assert c.json()["price"] == 2.99
        r = api_session.patch(
            f"{BASE_URL}/api/admin/templates/{tid}",
            json={"template_type": "free"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["template_type"] == "free"
        assert r.json()["price"] == 0.0
        api_session.delete(f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers)

    def test_create_emits_notification(self, api_session, auth_headers):
        c = self._create_image(api_session, auth_headers, "TEST_NotifEmit")
        tid = c.json()["id"]
        n = api_session.get(f"{BASE_URL}/api/notifications").json()
        assert any(x.get("template_id") == tid for x in n)
        api_session.delete(f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers)

    def test_delete_then_404(self, api_session, auth_headers):
        c = self._create_image(api_session, auth_headers, "TEST_Delete")
        tid = c.json()["id"]
        d = api_session.delete(f"{BASE_URL}/api/admin/templates/{tid}", headers=auth_headers)
        assert d.status_code == 200
        g = api_session.get(f"{BASE_URL}/api/templates/{tid}")
        assert g.status_code == 404

    def test_delete_nonexistent(self, api_session, auth_headers):
        r = api_session.delete(
            f"{BASE_URL}/api/admin/templates/nonexistent-xyz", headers=auth_headers
        )
        assert r.status_code == 404

    def test_create_requires_auth(self, api_session):
        r = api_session.post(
            f"{BASE_URL}/api/admin/templates",
            json={
                "title": "TEST_NoAuth", "category": "AV Player Template",
                "template_type": "free", "price": 0,
                "download_link": "https://x.com/y", "media_type": "image",
                "thumbnail_base64": _IMG_DATA_URI, "video_base64": "",
            },
        )
        assert r.status_code == 401
